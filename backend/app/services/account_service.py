"""Account lifecycle shared between auth flows.

adopt_anonymous_account is the single implementation of "the device
account's records now belong to this real account" — used by Google login
and email verification. It supersedes the inline migration that lived in
the Google route, which predated several tables: deleting the anonymous
user used to cascade away daily_usage (an accidental daily-quota reset on
registration), skill_events, and taste_profiles.
"""
import logging

from sqlalchemy.orm import Session

from app.database.models import (
    AIUsage,
    Collection,
    DailyUsage,
    Journal,
    PublicComment,
    SavedArtwork,
    Session as UserSession,
    SkillEvent,
    TasteProfile,
    User,
    UserCredential,
)

logger = logging.getLogger(__name__)


def adopt_anonymous_account(db: Session, anonymous_user_id: str, target_user: User) -> bool:
    """Re-parent everything owned by the anonymous device account onto
    target_user, then delete the empty anonymous row. Commit is the
    caller's responsibility. Returns True if an adoption happened.

    Only truly anonymous accounts are adoptable: a row with a google_id,
    a password credential, or a verified email is a real account and is
    never silently absorbed.
    """
    if not anonymous_user_id or anonymous_user_id == target_user.user_id:
        return False

    anon = db.query(User).filter(User.user_id == anonymous_user_id).first()
    if not anon or anon.google_id or anon.email_verified:
        return False
    if db.query(UserCredential).filter(UserCredential.user_id == anonymous_user_id).first():
        return False

    logger.info("Adopting anonymous account %s into %s", anonymous_user_id, target_user.user_id)

    for model in (SavedArtwork, Collection, UserSession, Journal, SkillEvent, PublicComment, AIUsage):
        db.query(model).filter(model.user_id == anonymous_user_id).update(
            {model.user_id: target_user.user_id}
        )

    # daily_usage has a (user_id, day) primary key, so days where both
    # accounts have counters must be summed, not re-parented.
    target_days = {
        row.day: row
        for row in db.query(DailyUsage).filter(DailyUsage.user_id == target_user.user_id)
    }
    for anon_row in db.query(DailyUsage).filter(DailyUsage.user_id == anonymous_user_id).all():
        existing = target_days.get(anon_row.day)
        if existing:
            existing.tokens_in += anon_row.tokens_in
            existing.tokens_out += anon_row.tokens_out
            existing.artworks_uploaded += anon_row.artworks_uploaded
            db.delete(anon_row)
        else:
            anon_row.user_id = target_user.user_id

    # Taste profile is derived data keyed by user_id; the real account's
    # own profile (if any) wins, the anonymous one regenerates on demand.
    if db.query(TasteProfile).filter(TasteProfile.user_id == target_user.user_id).first():
        db.query(TasteProfile).filter(TasteProfile.user_id == anonymous_user_id).delete()
    else:
        db.query(TasteProfile).filter(TasteProfile.user_id == anonymous_user_id).update(
            {TasteProfile.user_id: target_user.user_id}
        )

    db.flush()
    db.delete(anon)
    return True
