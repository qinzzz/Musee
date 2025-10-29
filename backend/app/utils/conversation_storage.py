"""
In-memory storage for artwork analysis conversation history.

This is a simple in-memory implementation for testing.
For production, this should be replaced with a database.
"""

from typing import Dict, List
from dataclasses import dataclass, field
from datetime import datetime
import uuid


@dataclass
class ConversationMessage:
    """Represents a single message in the conversation"""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ArtworkConversation:
    """Represents a conversation about a specific artwork"""
    conversation_id: str
    artist_name: str
    artwork_name: str
    messages: List[ConversationMessage] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


class ConversationStorage:
    """In-memory storage for artwork conversations"""

    def __init__(self):
        self._conversations: Dict[str, ArtworkConversation] = {}

    def create_conversation(self, artist_name: str, artwork_name: str) -> str:
        """Create a new conversation and return its ID"""
        conversation_id = str(uuid.uuid4())
        conversation = ArtworkConversation(
            conversation_id=conversation_id,
            artist_name=artist_name,
            artwork_name=artwork_name
        )
        self._conversations[conversation_id] = conversation
        return conversation_id

    def get_conversation(self, conversation_id: str) -> ArtworkConversation | None:
        """Get a conversation by ID"""
        return self._conversations.get(conversation_id)

    def add_message(self, conversation_id: str, role: str, content: str) -> bool:
        """Add a message to a conversation"""
        conversation = self._conversations.get(conversation_id)
        if not conversation:
            return False

        message = ConversationMessage(role=role, content=content)
        conversation.messages.append(message)
        conversation.updated_at = datetime.now()
        return True

    def get_messages(self, conversation_id: str) -> List[ConversationMessage]:
        """Get all messages from a conversation"""
        conversation = self._conversations.get(conversation_id)
        if not conversation:
            return []
        return conversation.messages

    def clear_conversation(self, conversation_id: str) -> bool:
        """Clear a conversation"""
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            return True
        return False

    def get_all_conversations(self) -> Dict[str, ArtworkConversation]:
        """Get all conversations (for debugging)"""
        return self._conversations


# Global instance
conversation_storage = ConversationStorage()
