"""
Telegram tool node implementation using the BaseNode class.
"""

import logging
from typing import Dict, Any, cast
from uuid import UUID

from ..base_node import BaseNode
from app.modules.integration.telegram import TelegramConnector
from app.services.app_settings import AppSettingsService
from app.dependencies.injector import injector

logger = logging.getLogger(__name__)


class TelegramToolNode(BaseNode):
    """Processor for sending Telegram messages to chats/channels/users using the BaseNode approach"""

    async def process(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a Telegram message node.

        Expected input format:
        {
            "app_settings_id": "<app-settings-uuid>",
            "chat_id": "<telegram-chat-id-or-@channelusername>",
            "message": "hello world"
        }

        Args:
            config: The resolved configuration for the node

        Returns:
            Dictionary with Telegram API response
        """
        # Get configuration values (already resolved by BaseNode)
        app_settings_id = config.get("app_settings_id")
        chat_id = config.get("chat_id", "")
        message = config.get("message", "")

        # Validate required parameters
        if not all([app_settings_id, chat_id, message]):
            error_msg = "Telegram tool: app_settings_id, chat_id and message are required"
            logger.error(error_msg)
            return {"status": 400, "data": {"error": error_msg}}

        try:
            # Get app settings from database
            app_settings_service = injector.get(AppSettingsService)
            app_settings = await app_settings_service.get_by_id(UUID(app_settings_id))

            # Extract token from app settings values
            values = app_settings.values if isinstance(app_settings.values, dict) else {}
            token = values.get("telegram_bot_token")

            # Validate that we have the required values and they are strings
            if not token or not isinstance(token, str):
                error_msg = (
                    "Telegram tool: telegram_bot_token not found or invalid in app settings"
                )
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            # Validate chat_id and message are strings
            if not isinstance(chat_id, str):
                error_msg = "Telegram tool: chat_id must be a string"
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            if not isinstance(message, str):
                error_msg = "Telegram tool: message must be a string"
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            # At this point, we know chat_id and message are strings
            telegram_chat_id: str = cast(str, chat_id)
            message_text: str = cast(str, message)

            # Send the Telegram message
            telegram_connector = TelegramConnector(token=token)
            result = await telegram_connector.send_message(
                chat_id=telegram_chat_id, text=message_text
            )
            return result

        except Exception as e:
            error_msg = f"Error sending Telegram message: {str(e)}"
            logger.error(error_msg)
            return {"status": 500, "data": {"error": error_msg}}
