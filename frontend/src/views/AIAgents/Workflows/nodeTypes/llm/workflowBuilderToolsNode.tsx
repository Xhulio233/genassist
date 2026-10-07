import React from "react";
import { NodeProps } from "reactflow";
import { WorkflowBuilderToolsNodeData } from "../../types/nodes";
import { getNodeColor } from "../../utils/nodeColors";
import BaseNodeContainer from "../BaseNodeContainer";
import nodeRegistry from "../../registry/nodeRegistry";

export const WORKFLOW_BUILDER_TOOLS_NODE_TYPE = "workflowBuilderToolsNode";

/**
 * Gives the connected agent the Workflow Builder tool set (search nodes, read
 * and edit the workflow draft, finalize). The tools themselves are defined on
 * the backend; this node has nothing to configure.
 */
const WorkflowBuilderToolsNode: React.FC<
  NodeProps<WorkflowBuilderToolsNodeData>
> = ({ id, data, selected }) => {
  const nodeDefinition = nodeRegistry.getNodeType(
    WORKFLOW_BUILDER_TOOLS_NODE_TYPE
  );
  const color = getNodeColor(nodeDefinition?.category || "ai");

  return (
    <BaseNodeContainer
      id={id}
      data={data}
      selected={selected}
      iconName={nodeDefinition?.icon || "Wrench"}
      title={data.name || nodeDefinition?.label || "Workflow Builder Tools"}
      subtitle={
        nodeDefinition?.shortDescription || "Tools for building workflows"
      }
      color={color}
      nodeType={WORKFLOW_BUILDER_TOOLS_NODE_TYPE}
    >
      {/* Node content */}
      <div />
    </BaseNodeContainer>
  );
};

export default React.memo(WorkflowBuilderToolsNode);
