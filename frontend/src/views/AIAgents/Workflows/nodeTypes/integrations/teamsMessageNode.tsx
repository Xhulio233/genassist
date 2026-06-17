import React, { useEffect, useState } from "react";
import { NodeProps } from "reactflow";
import { getNodeColor } from "../../utils/nodeColors.ts";
import { TeamsMessageNodeData } from "../../types/nodes.ts";
import { getAllDataSources } from "@/services/dataSources.ts";
import { DataSource } from "@/interfaces/dataSource.interface.ts";
import { useQuery } from "@tanstack/react-query";
import BaseNodeContainer from "../BaseNodeContainer";
import { TeamsMessageDialog } from "@/views/AIAgents/Workflows/nodeDialogs/TeamsMessageDialog.tsx";
import nodeRegistry from "../../registry/nodeRegistry";
import { NodeContentRow } from "../nodeContent.tsx";

export const TEAMS_MESSAGE_NODE_TYPE = "teamsMessageNode";

const TeamsMessageNode: React.FC<NodeProps<TeamsMessageNodeData>> = ({
  id,
  data,
  selected,
}) => {
  const nodeDefinition = nodeRegistry.getNodeType(TEAMS_MESSAGE_NODE_TYPE);
  const color = getNodeColor(nodeDefinition.category);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: connectors = [] } = useQuery({
    queryKey: ["dataSources"],
    queryFn: getAllDataSources,
    select: (data: DataSource[]) =>
      data.filter((p) => p.is_active === 1 && p.source_type === "o365"),
  });

  const selectedConnector = connectors.find(
    (c) => c.id.toString() === data.dataSourceId
  );

  useEffect(() => {
    if (
      (data.dataSourceId === undefined || data.dataSourceId === "") &&
      connectors.length > 0
    ) {
      if (data.updateNodeData) {
        data.updateNodeData<TeamsMessageNodeData>(id, {
          ...data,
          dataSourceId: connectors[0].id,
        });
      }
    }
  }, [connectors, data.dataSourceId, id, data]);

  const onUpdate = (updatedData: Partial<TeamsMessageNodeData>) => {
    if (data.updateNodeData) {
      data.updateNodeData(id, { ...data, ...updatedData });
    }
  };

  const nodeContent: NodeContentRow[] = [
    {
      label: "Connector",
      value: selectedConnector?.name,
      placeholder: "None selected",
    },
    { label: "Channel ID", value: data.channel_id },
    { label: "Message", value: data.message },
  ];

  return (
    <>
      <BaseNodeContainer
        id={id}
        data={data}
        selected={selected}
        iconName={nodeDefinition.icon}
        title={data.name || nodeDefinition.label}
        subtitle={nodeDefinition.shortDescription}
        color={color}
        nodeType={TEAMS_MESSAGE_NODE_TYPE}
        nodeContent={nodeContent}
        onSettings={() => setIsEditDialogOpen(true)}
      />

      <TeamsMessageDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        data={data}
        onUpdate={onUpdate}
        connectors={connectors}
        nodeId={id}
        nodeType={TEAMS_MESSAGE_NODE_TYPE}
      />
    </>
  );
};

export default TeamsMessageNode;
