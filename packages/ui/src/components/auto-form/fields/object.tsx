import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { FormField } from "@workspace/ui/components/form";
import { useForm, useFormContext } from "react-hook-form";
import * as z from "zod";
import { DEFAULT_ZOD_HANDLERS, INPUT_COMPONENTS } from "../config";
import type { Dependency, FieldConfig, FieldConfigItem } from "../types";
import {
  beautifyObjectName,
  getBaseSchema,
  getBaseType,
  sortFieldsByOrder,
  zodToHtmlInputProps,
} from "../utils";
import AutoFormArray from "./array";
import resolveDependencies from "../dependencies";

function DefaultParent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function AutoFormObject<
  SchemaType extends z.ZodObject<any, any>,
>({
  schema,
  form,
  fieldConfig,
  path = [],
  dependencies = [],
}: {
  schema: SchemaType | z.ZodType<z.infer<SchemaType>>;
  form: ReturnType<typeof useForm>;
  fieldConfig?: FieldConfig<z.infer<SchemaType>>;
  path?: string[];
  dependencies?: Dependency<z.infer<SchemaType>>[];
}) {
  const { watch } = useFormContext(); // Use useFormContext to access the watch function

  if (!schema) {
    return null;
  }
  const { shape } = getBaseSchema<SchemaType>(schema as SchemaType) || {};

  if (!shape) {
    return null;
  }

  const handleIfZodNumber = (item: z.ZodType) => {
    // Check for ZodNumber (Zod v4 uses type in _zod.def)
    const def = (item as any)._zod?.def;
    const defType = def?.type;
    const innerDefType = def?.innerType?._zod?.def?.type;

    const isZodNumber =
      defType === "number" || defType === "int" || defType === "float";
    const isInnerZodNumber =
      innerDefType === "number" ||
      innerDefType === "int" ||
      innerDefType === "float";

    if (isZodNumber && def) {
      def.coerce = true;
    } else if (isInnerZodNumber && def?.innerType?._zod?.def) {
      def.innerType._zod.def.coerce = true;
    }

    return item;
  };

  const sortedFieldKeys = sortFieldsByOrder(fieldConfig, Object.keys(shape));

  return (
    <Accordion type="multiple" className="space-y-5 border-none">
      {sortedFieldKeys.map((name) => {
        let item = shape[name] as z.ZodType;
        item = handleIfZodNumber(item);
        const zodBaseType = getBaseType(item);
        const itemName = beautifyObjectName(name);
        const key = [...path, name].join(".");

        const {
          isHidden,
          isDisabled,
          isRequired: isRequiredByDependency,
          overrideOptions,
        } = resolveDependencies(dependencies, name, watch);
        if (isHidden) {
          return null;
        }

        if (zodBaseType === "ZodObject") {
          return (
            <AccordionItem value={name} key={key} className="border-none">
              <AccordionTrigger>{itemName}</AccordionTrigger>
              <AccordionContent className="p-2">
                <AutoFormObject
                  schema={item as unknown as z.ZodObject<any, any>}
                  form={form}
                  fieldConfig={(fieldConfig?.[name] ?? {}) as any}
                  path={[...path, name]}
                />
              </AccordionContent>
            </AccordionItem>
          );
        }
        if (zodBaseType === "ZodArray") {
          return (
            <AutoFormArray
              key={key}
              name={name}
              item={item as unknown as z.ZodArray<any>}
              form={form}
              fieldConfig={fieldConfig?.[name] ?? {}}
              path={[...path, name]}
            />
          );
        }

        const fieldConfigItem: FieldConfigItem = fieldConfig?.[name] ?? {};
        const zodInputProps = zodToHtmlInputProps(item);
        
        // Determine required status:
        // 1. If dependency sets required, use that
        // 2. If fieldConfig explicitly sets required (true/false), use that
        // 3. Otherwise, use zodInputProps.required
        let isRequired = isRequiredByDependency || zodInputProps.required || false;
        if (fieldConfigItem.inputProps?.required !== undefined) {
          isRequired = fieldConfigItem.inputProps.required;
        }

        if (overrideOptions) {
          item = z.enum(overrideOptions) as unknown as z.ZodType;
        }

        return (
          <FormField
            control={form.control as any}
            name={key}
            key={key}
            render={({ field }) => {
              const inputType =
                fieldConfigItem.fieldType ??
                DEFAULT_ZOD_HANDLERS[zodBaseType] ??
                "fallback";

              const InputComponent =
                typeof inputType === "function"
                  ? inputType
                  : INPUT_COMPONENTS[inputType];

              const ParentElement =
                fieldConfigItem.renderParent ?? DefaultParent;

              const defaultValue = fieldConfigItem.inputProps?.defaultValue;
              const value = field.value ?? defaultValue ?? "";

              const fieldProps = {
                ...zodToHtmlInputProps(item),
                ...field,
                ...fieldConfigItem.inputProps,
                disabled: fieldConfigItem.inputProps?.disabled || isDisabled,
                ref: undefined,
                value: value,
              };

              if (InputComponent === undefined) {
                return <></>;
              }

              return (
                <ParentElement key={`${key}.parent`}>
                  <InputComponent
                    zodInputProps={zodInputProps}
                    field={field}
                    fieldConfigItem={fieldConfigItem}
                    label={itemName}
                    isRequired={isRequired}
                    zodItem={item}
                    fieldProps={fieldProps}
                    className={fieldProps.className}
                  />
                </ParentElement>
              );
            }}
          />
        );
      })}
    </Accordion>
  );
}
