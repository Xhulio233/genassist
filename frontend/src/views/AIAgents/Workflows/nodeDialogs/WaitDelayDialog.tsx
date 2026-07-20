import React, { useState, useEffect, useMemo } from "react";
import { WaitDelayNodeData } from "../types/nodes";
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
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { BaseNodeDialogProps } from "./base";

type WaitDelayDialogProps = BaseNodeDialogProps<
  WaitDelayNodeData,
  WaitDelayNodeData
>;

type WaitMode = "duration" | "timestamp";
type DurationUnit = "seconds" | "minutes" | "hours";

export const WaitDelayDialog: React.FC<WaitDelayDialogProps> = (props) => {
  const { isOpen, onClose, data, onUpdate } = props;

  const [name, setName] = useState(data.name || "Wait / Delay");
  const [mode, setMode] = useState<WaitMode>(data.mode ?? "duration");
  const [duration, setDuration] = useState<number>(data.duration ?? 5);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    data.durationUnit ?? "seconds"
  );
  const [timestamp, setTimestamp] = useState(data.timestamp ?? "");

  useEffect(() => {
    if (isOpen) {
      setName(data.name || "Wait / Delay");
      setMode(data.mode ?? "duration");
      setDuration(data.duration ?? 5);
      setDurationUnit(data.durationUnit ?? "seconds");
      setTimestamp(data.timestamp ?? "");
    }
  }, [isOpen, data]);

  const isTimestamp = mode === "timestamp";

  // The picker works with Date objects; we persist the value as an ISO string.
  const timestampDate = useMemo(() => {
    if (!timestamp) return undefined;
    const parsed = new Date(timestamp);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [timestamp]);

  // Disable days before today so only the present/future can be selected.
  const isPastDay = (day: Date) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return day < startOfToday;
  };

  const handleSave = () => {
    onUpdate({
      ...data,
      name,
      mode,
      duration,
      durationUnit,
      timestamp,
    });
    onClose();
  };

  return (
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
      data={{ ...data, name, mode, duration, durationUnit, timestamp }}
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Node Name</Label>
          <RichInput
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Wait / Delay"
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wait-mode">Wait mode</Label>
          <Select
            value={mode}
            onValueChange={(value) => setMode(value as WaitMode)}
          >
            <SelectTrigger id="wait-mode">
              <SelectValue placeholder="Select wait mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="duration">For a duration</SelectItem>
              <SelectItem value="timestamp">Until a timestamp</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {isTimestamp
              ? "Pauses until the selected date and time is reached."
              : "Pauses for the amount of time set below."}
          </p>
        </div>

        {isTimestamp ? (
          <div className="space-y-2">
            <Label>Wait until</Label>
            <DateTimePicker
              date={timestampDate}
              setDate={(d) => setTimestamp(d ? d.toISOString() : "")}
              disabled={isPastDay}
              contentClassName="z-[1400]"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wait-duration">Duration</Label>
              <RichInput
                id="wait-duration"
                type="number"
                min={0}
                step="1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-unit">Unit</Label>
              <Select
                value={durationUnit}
                onValueChange={(value) =>
                  setDurationUnit(value as DurationUnit)
                }
              >
                <SelectTrigger id="wait-unit">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Seconds</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </NodeConfigPanel>
  );
};
