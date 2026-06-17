import React, { useState, useEffect } from "react";
import { TeamsMessageNodeData } from "../types/nodes";
import { DataSource } from "@/interfaces/dataSource.interface";
import { Button } from "@/components/button";
import { RichInput } from "@/components/richInput";
import { Label } from "@/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";
import { Save } from "lucide-react";
import { NodeConfigPanel } from "../components/NodeConfigPanel";
import { DraggableInput } from "../components/custom/DraggableInput";
import { BaseNodeDialogProps } from "./base";
import { DataSourceDialog } from "@/views/DataSources/components/DataSourceDialog";
import { CreateNewSelectItem } from "@/components/CreateNewSelectItem";

interface TeamsMessageDialogProps
  extends BaseNodeDialogProps<TeamsMessageNodeData, TeamsMessageNodeData> {
  connectors: DataSource[];
}

export const TeamsMessageDialog: React.FC<TeamsMessageDialogProps> = (
  props
) => {
  const { isOpen, onClose, data, onUpdate, connectors } = props;

  const [name, setName] = useState(data.name || "");
  const [dataSourceId, setDataSourceId] = useState(
    data.dataSourceId?.toString() || ""
  );
  const [teamId, setTeamId] = useState(data.team_id || "");
  const [channelId, setChannelId] = useState(data.channel_id || "");
  const [message, setMessage] = useState(data.message || "");
  const [isCreateDataSourceOpen, setIsCreateDataSourceOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(data.name || "");
      setDataSourceId(data.dataSourceId?.toString() || "");
      setTeamId(data.team_id || "");
      setChannelId(data.channel_id || "");
      setMessage(data.message || "");
    }
  }, [isOpen, data]);

  const handleSave = () => {
    onUpdate({
      ...data,
      name,
      dataSourceId,
      team_id: teamId,
      channel_id: channelId,
      message,
    });
    onClose();
  };

  return (
    <>
      <NodeConfigPanel
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </>
        }
        {...props}
        data={{
          ...data,
          name,
          dataSourceId,
          team_id: teamId,
          channel_id: channelId,
          message,
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="node-name">Node Name</Label>
          <RichInput
            id="node-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Microsoft Teams"
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="connector-select">Select Connector</Label>
          <Select
            value={dataSourceId}
            onValueChange={(val) => {
              if (val === "__create__") {
                setIsCreateDataSourceOpen(true);
                return;
              }
              setDataSourceId(val);
            }}
          >
            <SelectTrigger id="connector-select">
              <SelectValue placeholder="Select connector" />
            </SelectTrigger>
            <SelectContent>
              {connectors.map((conn) => (
                <SelectItem key={conn.id} value={String(conn.id)}>
                  {conn.name}
                </SelectItem>
              ))}
              <CreateNewSelectItem />
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-id">Team ID</Label>
          <DraggableInput
            id="team-id"
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g., 19:abc123...@thread.tacv2"
            className="w-full break-all"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="channel-id">Channel ID</Label>
          <DraggableInput
            id="channel-id"
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g., 19:def456...@thread.tacv2"
            className="w-full break-all"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Message</Label>
          <DraggableInput
            id="message"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g., A new conversation needs attention"
            className="w-full"
          />
        </div>
      </NodeConfigPanel>
      <DataSourceDialog
        isOpen={isCreateDataSourceOpen}
        onOpenChange={setIsCreateDataSourceOpen}
        onDataSourceSaved={(created) => {
          if (created?.id) setDataSourceId(created.id);
        }}
        mode="create"
      />
    </>
  );
};
