"""
Microsoft Teams message node implementation using the BaseNode class.

Posts a message to a Microsoft Teams channel through Microsoft Graph, reusing
the delegated (refresh-token) auth flow established by the calendar node. The
connected Microsoft account must have consented to the ``ChannelMessage.Send``
delegated scope.
"""

import logging
from uuid import UUID
from typing import Any, Dict

from app.core.utils.encryption_utils import decrypt_key
from app.modules.integration.office365_connector import Office365Connector
from app.services.app_settings import AppSettingsService
from app.services.datasources import DataSourceService

from ..base_node import BaseNode

logger = logging.getLogger(__name__)

# Delegated Graph scope required to post a channel message as the connected user.
TEAMS_SCOPES = ["https://graph.microsoft.com/ChannelMessage.Send"]


class TeamsMessageNode(BaseNode):
    """Processor for sending Microsoft Teams channel messages using the BaseNode approach."""

    async def process(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a Microsoft Teams message node.

        Expected config:
        {
            "dataSourceId": "<o365-datasource-uuid>",
            "team_id": "<teams-group-id>",
            "channel_id": "<teams-channel-id>",
            "message": "hello world"
        }

        Args:
            config: The resolved configuration for the node

        Returns:
            Dictionary with the Microsoft Graph response (or an error payload)
        """
        from app.dependencies.injector import injector

        data_source_id = config.get("dataSourceId")
        team_id = config.get("team_id", "")
        channel_id = config.get("channel_id", "")
        message = config.get("message", "")

        if not all([data_source_id, team_id, channel_id, message]):
            error_msg = (
                "Teams tool: dataSourceId, team_id, channel_id and message are required"
            )
            logger.error(error_msg)
            return {"status": 400, "data": {"error": error_msg}}

        try:
            # Resolve the o365 data source that holds the user's refresh token.
            ds_service = injector.get(DataSourceService)
            data_src = await ds_service.get_by_id(
                data_source_id, decrypt_sensitive=True
            )

            if not data_src or not data_src.source_type or data_src.source_type.lower() != "o365":
                error_msg = "Teams tool: a Microsoft (o365) data source is required"
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            connection_data = data_src.connection_data or {}
            app_settings_id = connection_data.get("app_settings_id")
            if not app_settings_id:
                error_msg = "Teams tool: app settings ID not found in data source"
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            # Microsoft app credentials live on the linked app settings.
            settings_service = injector.get(AppSettingsService)
            app_settings = await settings_service.get_by_id(UUID(app_settings_id))
            values = app_settings.values if isinstance(app_settings.values, dict) else {}

            client_id = values.get("microsoft_client_id")
            client_secret = values.get("microsoft_client_secret")
            tenant_id = values.get("microsoft_tenant_id")

            if client_secret:
                client_secret = decrypt_key(client_secret)

            if not client_id or not client_secret or not tenant_id:
                error_msg = "Teams tool: Microsoft credentials not found in app settings"
                logger.error(error_msg)
                return {"status": 400, "data": {"error": error_msg}}

            connector = Office365Connector(
                for_sharepoint=False,
                client_id=client_id,
                client_secret=client_secret,
                tenant_id=tenant_id,
                refresh_token=connection_data["refresh_token"],
                redirect_uri=connection_data.get("redirect_uri"),
                scopes=TEAMS_SCOPES,
            )

            result = await connector.send_channel_message(
                team_id=str(team_id),
                channel_id=str(channel_id),
                message=str(message),
            )
            return {"status": 200, "data": result}

        except Exception as e:
            error_msg = f"Error sending Microsoft Teams message: {str(e)}"
            logger.error(error_msg)
            return {"status": 500, "data": {"error": error_msg}}
