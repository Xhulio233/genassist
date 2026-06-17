from typing import List
from ..base import FieldSchema

TEAMS_MESSAGE_NODE_DIALOG_SCHEMA: List[FieldSchema] = [
    FieldSchema(
        name="name",
        type="text",
        label="Node Name",
        required=False
    ),
    FieldSchema(
        name="dataSourceId",
        type="select",
        label="Connector",
        required=True
    ),
    FieldSchema(
        name="team_id",
        type="text",
        label="Team ID",
        required=True
    ),
    FieldSchema(
        name="channel_id",
        type="text",
        label="Channel ID",
        required=True
    ),
    FieldSchema(
        name="message",
        type="text",
        label="Message",
        required=True
    )
]
