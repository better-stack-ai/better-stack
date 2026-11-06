"use client";
import { Form } from "@workspace/ui/components/form";
import React, { useCallback, useState } from "react";
import type {
  DefaultValues,
  FormState,
  UseFormReturn,
} from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";
import { resolveVisibleSchema } from "@workspace/ui/lib/schema-converter";
import { z } from "zod";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";

import { FileUploadStatusContext } from "./fields/file";
import AutoFormObject from "./fields/object";
import type { Dependency, FieldConfig } from "./types";
import type { ZodObjectOrWrapped } from "./helpers";
import { getDefaultValues, getObjectFormSchema } from "./helpers";

export function AutoFormSubmit({
  children,
  className,
  disabled,
}: {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" disabled={disabled} className={className}>
      {children ?? "Submit"}
    </Button>
  );
}

function AutoForm<SchemaType extends ZodObjectOrWrapped>({
  formSchema,
  values: valuesProp,
  onValuesChange: onValuesChangeProp,
  onParsedValuesChange,
  onSubmit: onSubmitProp,
  fieldConfig,
  children,
  className,
  dependencies,
}: {
  formSchema: SchemaType;
  values?: Partial<z.infer<SchemaType>>;
  onValuesChange?: (
    values: Partial<z.infer<SchemaType>>,
    form: UseFormReturn<z.infer<SchemaType>>
  ) => void;
  onParsedValuesChange?: (
    values: Partial<z.infer<SchemaType>>,
    form: UseFormReturn<z.infer<SchemaType>>
  ) => void;
  onSubmit?: (
    values: z.infer<SchemaType>,
    form: UseFormReturn<z.infer<SchemaType>>
  ) => void;
  fieldConfig?: FieldConfig<z.infer<SchemaType>>;
  children?:
    | React.ReactNode
    | ((formState: FormState<z.infer<SchemaType>>) => React.ReactNode);
  className?: string;
  dependencies?: Dependency<z.infer<SchemaType>>[];
}) {
  const objectFormSchema = getObjectFormSchema(formSchema);
  const defaultValues: DefaultValues<z.infer<typeof objectFormSchema>> | null =
    getDefaultValues(objectFormSchema, fieldConfig);

  const form = useForm<Record<string, unknown>>({
    // Cast to any to handle Zod v4 type compatibility with @hookform/resolvers
    resolver: zodResolver(formSchema as any) as any,
    defaultValues: (defaultValues ?? undefined) as any,
    values: valuesProp as any,
  });

  const [uploadStatuses, setUploadStatuses] = useState<Record<string, "uploading" | "failed">>({});
  const reportUploadStatus = useCallback((name: string, status: "uploading" | "failed" | null) => {
    setUploadStatuses(previous => {
      if (previous[name] === status || (!status && !(name in previous))) return previous;
      const next = { ...previous };
      if (status) next[name] = status;
      else Reflect.deleteProperty(next, name);
      return next;
    });
  }, []);
  const uploading = Object.values(uploadStatuses).includes("uploading");
  const uploadBlocked = Object.keys(uploadStatuses).length > 0;
  const watchedValues = useWatch({ control: form.control });
  const metadata = formSchema.meta();
  const visibleKeys = metadata?.properties ? Object.keys(resolveVisibleSchema(metadata, watchedValues).schema.properties ?? {}) : null;
  const visibleObjectSchema = visibleKeys ? objectFormSchema.pick(Object.fromEntries(visibleKeys.map(key => [key, true]))) : objectFormSchema;

  const [schemaSubmitError, setSchemaSubmitError] = useState<string | null>(null);

  function onSubmit(values: Record<string, unknown>) {
    setSchemaSubmitError(null);
    const parsedValues = formSchema.safeParse(values);
    if (parsedValues.success) {
      onSubmitProp?.(parsedValues.data as z.infer<SchemaType>, form as any);
    } else {
      const message = parsedValues.error.issues
        .map(
          (issue) =>
            `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
        )
        .join(" · ");
      setSchemaSubmitError(message);
    }
  }

  React.useEffect(() => {
    const subscription = form.watch((values) => {
      onValuesChangeProp?.(values as any, form as any);
      const parsedValues = formSchema.safeParse(values);
      if (parsedValues.success) {
        onParsedValuesChange?.(parsedValues.data as any, form as any);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, formSchema, onValuesChangeProp, onParsedValuesChange]);

  const renderChildren =
    typeof children === "function"
      ? children(form.formState as FormState<z.infer<SchemaType>>)
      : children;

  return (
    <div className="w-full">
      <Form {...form}>
        <form
          onSubmit={(e) => {
            if (uploadBlocked) {
              e.preventDefault();
              setSchemaSubmitError(uploading ? "Wait for the upload to finish." : "Retry the failed file upload before submitting.");
              return;
            }
            form.handleSubmit(onSubmit, () => setSchemaSubmitError(null))(e);
          }}
          className={cn("space-y-5", className)}
        >
          <FileUploadStatusContext.Provider value={reportUploadStatus}>
          <fieldset disabled={uploading} className="contents">
          <AutoFormObject
            schema={visibleObjectSchema}
            form={form as any}
            dependencies={dependencies as any}
            fieldConfig={fieldConfig as any}
          />

          {schemaSubmitError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {schemaSubmitError}
            </div>
          ) : null}

          {renderChildren}
          </fieldset>
          </FileUploadStatusContext.Provider>
        </form>
      </Form>
    </div>
  );
}

export default AutoForm;
