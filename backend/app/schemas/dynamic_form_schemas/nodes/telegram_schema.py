from typing import List
from ..base import FieldSchema

TELEGRAM_NODE_DIALOG_SCHEMA: List[FieldSchema] = [
    FieldSchema(
        name="name",
        type="text",
        label="Node Name",
        required=False
    ),
    FieldSchema(
        name="app_settings_id",
        type="select",
        label="Configuration Vars",
        required=True
    ),
    FieldSchema(
        name="chat_id",
        type="text",
        label="Chat ID",
        required=True
    ),
    FieldSchema(
        name="message",
        type="text",
        label="Message",
        required=True
    )
]
