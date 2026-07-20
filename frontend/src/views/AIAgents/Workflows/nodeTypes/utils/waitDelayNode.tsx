import React, { useState } from "react";
import { NodeProps } from "reactflow";
import { format } from "date-fns";
import { WaitDelayNodeData } from "../../types/nodes";
import { getNodeColor } from "../../utils/nodeColors";
import { WaitDelayDialog } from "../../nodeDialogs/WaitDelayDialog";
import BaseNodeContainer from "../BaseNodeContainer";
import nodeRegistry from "../../registry/nodeRegistry";
import { NodeContentRow } from "../nodeContent";

export const WAIT_DELAY_NODE_TYPE = "waitDelayNode";

const WaitDelayNode: React.FC<NodeProps<WaitDelayNodeData>> = ({
  id,
  data,
  selected,
}) => {
  const nodeDefinition = nodeRegistry.getNodeType(WAIT_DELAY_NODE_TYPE);
  const color = getNodeColor(nodeDefinition.category);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const onUpdate = (updatedData: Partial<WaitDelayNodeData>) => {
    if (data.updateNodeData) {
      data.updateNodeData(id, { ...data, ...updatedData });
    }
  };

  const isTimestamp = data.mode === "timestamp";
  const formatTimestamp = (iso?: string) => {
    if (!iso) return "No time set";
    const parsed = new Date(iso);
    return isNaN(parsed.getTime())
      ? "No time set"
      : `Until ${format(parsed, "yyyy-MM-dd HH:mm")}`;
  };
  const waitValue = isTimestamp
    ? formatTimestamp(data.timestamp)
    : `${data.duration ?? 0} ${data.durationUnit ?? "seconds"}`;

  const nodeContent: NodeContentRow[] = [
    {
      label: "Wait",
      value: waitValue,
    },
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
        nodeType={WAIT_DELAY_NODE_TYPE}
        nodeContent={nodeContent}
        onSettings={() => setIsEditDialogOpen(true)}
      />

      <WaitDelayDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        data={data}
        onUpdate={onUpdate}
        nodeId={id}
        nodeType={WAIT_DELAY_NODE_TYPE}
      />
    </>
  );
};

export default React.memo(WaitDelayNode);
