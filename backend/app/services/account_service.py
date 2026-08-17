"""Account lifecycle shared between authentication flows.

Public auth routes enter through promote_guest_workspace, which validates the
HttpOnly guest credential. adopt_anonymous_account is the internal data mover
also used by server-bound email verification tokens.
"""
import logging

from sqlalchemy.orm import Session

from app.database.models import (
    AIUsage,
    Collection,
    DailyUsage,
    GuestWorkspace,
    Journal,
    PublicComment,
    SavedArtwork,
    Session as UserSession,
    SkillEvent,
    TasteProfile,
    User,
    UserCredential,
)
from app.services.authorization_service import resolve_guest_workspace

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

    # Retire the legacy device ownership marker along with the guest principal;
    # no promoted artwork should remain addressable by the old guest id.
    db.query(SavedArtwork).filter(SavedArtwork.user_id == anonymous_user_id).update({
        SavedArtwork.user_id: target_user.user_id,
        SavedArtwork.device_id: target_user.user_id,
    })

    for model in (Collection, UserSession, Journal, SkillEvent, PublicComment, AIUsage):
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


def promote_guest_workspace(db: Session, guest_token: str | None, target_user: User) -> bool:
    """Promote the guest workspace proven by its HttpOnly credential.

    The raw token is validated before any user id is considered. The workspace
    row is then locked so concurrent login callbacks cannot promote the same
    guest account twice. The existing adoption routine remains the canonical
    transactional data mover.
    """
    workspace = resolve_guest_workspace(db, guest_token)
    if workspace is None:
        return False

    locked_workspace = (
        db.query(GuestWorkspace)
        .filter(GuestWorkspace.id == workspace.id)
        .with_for_update()
        .first()
    )
    if locked_workspace is None:
        return False
    return adopt_anonymous_account(db, locked_workspace.user_id, target_user)
