from typing import Dict, Any
import logging

from app.core.utils.bi_utils import make_async_web_call

logger = logging.getLogger(__name__)


class TelegramConnector:

    def __init__(self, token: str):
        self.token = token
        self.base_url = f"https://api.telegram.org/bot{token}"

    async def send_message(self, chat_id: str, text: str) -> Dict[str, Any]:
        """Send a Telegram message to a chat, channel, or user via the Bot API."""
        url = f"{self.base_url}/sendMessage"
        headers = {
            "Content-Type": "application/json",
        }
        payload = {
            "chat_id": chat_id,
            "text": text,
        }

        return await make_async_web_call(
            method="POST", url=url, headers=headers, payload=payload
        )
