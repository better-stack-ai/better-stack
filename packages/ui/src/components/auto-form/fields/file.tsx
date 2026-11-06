"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormItem, FormMessage } from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import AutoFormLabel from "../common/label";
import AutoFormTooltip from "../common/tooltip";
import type { AutoFormInputComponentProps } from "../types";

export const FileUploadStatusContext = createContext<(name: string, status: "uploading" | "failed" | null) => void>(() => {});

export default function AutoFormFile({ field, fieldProps, fieldConfigItem, label, isRequired }: AutoFormInputComponentProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useFormContext();
  const reportStatus = useContext(FileUploadStatusContext);
  useEffect(() => () => reportStatus(field.name, null), [field.name, reportStatus]);
  const onUpload = fieldConfigItem.onUpload;
  return (
    <FormItem>
      <AutoFormLabel label={fieldConfigItem.label || label} isRequired={isRequired} />
      <FormControl>
        <Input type="file" name={field.name} onBlur={field.onBlur} accept={fieldProps.accept} disabled={fieldProps.disabled || uploading || !onUpload}
          required={isRequired && !field.value}
          onChange={async event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file || !onUpload) return;
            setUploading(true);
            reportStatus(field.name, "uploading");
            setError(null);
            form.setError(field.name, { type: "upload", message: "Upload in progress" });
            try {
              const url = await onUpload(file);
              if (typeof url !== "string" || !url.trim()) throw new Error("Upload must return a URL string");
              field.onChange(url);
              form.clearErrors(field.name);
              reportStatus(field.name, null);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Upload failed";
              setError(message);
              reportStatus(field.name, "failed");
              form.setError(field.name, { type: "upload", message });
            } finally { setUploading(false); input.value = ""; }
          }} />
      </FormControl>
      <p className="text-sm text-muted-foreground" role="status">{uploading ? "Uploading…" : !onUpload ? "File uploads are not configured." : field.value ? "File uploaded" : ""}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AutoFormTooltip fieldConfigItem={fieldConfigItem} />
      <FormMessage />
    </FormItem>
  );
}
