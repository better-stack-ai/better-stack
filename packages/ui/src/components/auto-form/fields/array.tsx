import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Plus, Trash } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { beautifyObjectName, getBaseSchema, getBaseType } from "../helpers";
import AutoFormObject from "./object";

function getDefType(schema: z.ZodType): string {
  return (schema as any)._zod?.def?.type || "";
}

function getArrayElementType(item: z.ZodType): z.ZodType | null {
  const def = (item as any)._zod?.def;
  const defType = getDefType(item);

  if (defType === "array") {
    return def?.element || null;
  }

  if (["default", "optional", "nullable"].includes(defType)) {
    const innerType = def?.innerType;
    if (innerType) {
      return getArrayElementType(innerType);
    }
  }

  return null;
}

function getPrimitiveDefault(itemSchema: z.ZodType): unknown {
  const base = getBaseSchema(itemSchema as z.ZodType);
  if (!base) return "";
  switch (getBaseType(base)) {
    case "ZodBoolean":
      return false;
    case "ZodNumber":
      return 0;
    default:
      return "";
  }
}

export default function AutoFormArray({
  name,
  item,
  form,
  path = [],
  fieldConfig,
}: {
  name: string;
  item: z.ZodArray<any> | z.ZodDefault<any>;
  form: ReturnType<typeof useForm>;
  path?: string[];
  fieldConfig?: any;
}) {
  const itemDefType = getArrayElementType(item);
  const elementBaseSchema = itemDefType
    ? getBaseSchema(itemDefType as z.ZodType)
    : null;
  const elementPrimitiveType = elementBaseSchema
    ? getBaseType(elementBaseSchema as z.ZodType)
    : "";
  const isObjectArray = !!itemDefType && elementPrimitiveType === "ZodObject";

  const title = fieldConfig?.label ?? beautifyObjectName(name);

  if (isObjectArray) {
    return (
      <ObjectAutoFormArray
        name={name}
        item={item}
        form={form}
        path={path}
        fieldConfig={fieldConfig}
        itemDefType={itemDefType as z.ZodObject<any, any>}
        title={title}
      />
    );
  }

  return (
    <PrimitiveAutoFormArray
      name={name}
      item={item}
      form={form}
      path={path}
      fieldConfig={fieldConfig}
      itemDefType={itemDefType}
      title={title}
    />
  );
}

/**
 * ObjectAutoFormArray — uses useFieldArray (safe for object arrays because
 * react-hook-form only wraps objects; the `id` field it injects doesn't affect
 * validation since the schema doesn't include it).
 */
function ObjectAutoFormArray({
  name,
  form,
  path = [],
  fieldConfig,
  itemDefType,
  title,
}: {
  name: string;
  item: z.ZodArray<any> | z.ZodDefault<any>;
  form: ReturnType<typeof useForm>;
  path?: string[];
  fieldConfig?: any;
  itemDefType: z.ZodObject<any, any>;
  title: string;
}) {
  const fieldPath = path.join(".");
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: fieldPath,
  });

  return (
    <AccordionItem value={name} className="border-none">
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>
        {fields.map((_field, index) => {
          const key = _field.id;
          return (
            <div className="mt-4 flex flex-col" key={key}>
              <AutoFormObject
                schema={itemDefType}
                form={form}
                fieldConfig={fieldConfig}
                path={[...path, index.toString()]}
              />
              <div className="my-4 flex justify-end">
                <Button
                  variant="secondary"
                  size="icon"
                  type="button"
                  className="hover:bg-zinc-300 hover:text-black focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-white dark:text-black dark:hover:bg-zinc-300 dark:hover:text-black dark:hover:ring-0 dark:hover:ring-offset-0 dark:focus-visible:ring-0 dark:focus-visible:ring-offset-0"
                  onClick={() => remove(index)}
                >
                  <Trash className="size-4" />
                </Button>
              </div>
              <Separator />
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          onClick={() => append({})}
          className="mt-4 flex items-center"
        >
          <Plus className="mr-2" size={16} />
          Add
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * PrimitiveAutoFormArray — does NOT use useFieldArray.
 *
 * useFieldArray wraps every element in an object `{ id: "...", <value> }` which
 * corrupts primitive arrays (string[], number[], boolean[]). Instead we use
 * useWatch to observe the raw array and form.setValue to mutate it, keeping
 * the values as plain primitives that will pass Zod validation on submit.
 */
function PrimitiveAutoFormArray({
  name,
  item,
  form,
  path = [],
  fieldConfig,
  itemDefType,
  title,
}: {
  name: string;
  item: z.ZodArray<any> | z.ZodDefault<any>;
  form: ReturnType<typeof useForm>;
  path?: string[];
  fieldConfig?: any;
  itemDefType: z.ZodType | null;
  title: string;
}) {
  const fieldPath = path.join(".");
  const rawValues: unknown[] = useWatch({ control: form.control, name: fieldPath }) ?? [];
  const values = Array.isArray(rawValues) ? rawValues : [];

  const appendItem = () => {
    const def = itemDefType ? getPrimitiveDefault(itemDefType) : "";
    form.setValue(fieldPath as any, [...values, def] as any, {
      shouldDirty: true,
      shouldValidate: false,
    });
  };

  const removeItem = (index: number) => {
    const next = values.filter((_, i) => i !== index);
    form.setValue(fieldPath as any, next as any, {
      shouldDirty: true,
      shouldValidate: false,
    });
  };

  return (
    <AccordionItem value={name} className="border-none">
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>
        {values.map((_, index) => {
          const cellPath = `${fieldPath}.${index}`;
          return (
            <div className="mt-4 flex flex-col" key={`${fieldPath}-${index}`}>
              {itemDefType ? (
                <PrimitiveArrayRow
                  form={form}
                  itemSchema={itemDefType}
                  cellPath={cellPath}
                />
              ) : null}
              <div className="my-4 flex justify-end">
                <Button
                  variant="secondary"
                  size="icon"
                  type="button"
                  className="hover:bg-zinc-300 hover:text-black focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-white dark:text-black dark:hover:bg-zinc-300 dark:hover:text-black dark:hover:ring-0 dark:hover:ring-offset-0 dark:focus-visible:ring-0 dark:focus-visible:ring-offset-0"
                  onClick={() => removeItem(index)}
                >
                  <Trash className="size-4" />
                </Button>
              </div>
              <Separator />
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          onClick={appendItem}
          className="mt-4 flex items-center"
        >
          <Plus className="mr-2" size={16} />
          Add
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

function PrimitiveArrayRow({
  form,
  itemSchema,
  cellPath,
}: {
  form: ReturnType<typeof useForm>;
  itemSchema: z.ZodType;
  cellPath: string;
}) {
  const baseSchema = getBaseSchema(itemSchema) as z.ZodType | null;
  const t = baseSchema ? getBaseType(baseSchema) : "";

  if (t === "ZodBoolean") {
    return (
      <FormField
        control={form.control as any}
        name={cellPath}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2 space-y-0">
            <FormControl>
              <input
                type="checkbox"
                aria-label="Toggle"
                checked={Boolean(field.value)}
                onChange={(e) => field.onChange(e.target.checked)}
              />
            </FormControl>
            <FormLabel className="font-normal cursor-pointer">
              {(field.value as boolean | undefined) ? "Selected" : "Not selected"}
            </FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  const inputType = t === "ZodNumber" ? ("number" as const) : ("text" as const);

  return (
    <FormField
      control={form.control as any}
      name={cellPath}
      render={({ field }) => (
        <FormItem className="space-y-2">
          <FormLabel className="sr-only">Row value</FormLabel>
          <FormControl>
            <Input
              type={inputType}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                field.value === undefined || field.value === null
                  ? ""
                  : String(field.value)
              }
              onChange={(ev) =>
                field.onChange(
                  inputType === "number"
                    ? ev.target.valueAsNumber
                    : ev.target.value,
                )
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
