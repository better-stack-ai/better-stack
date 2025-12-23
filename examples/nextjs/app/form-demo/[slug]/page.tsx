"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { QueryClientProvider } from "@tanstack/react-query";
import { BetterStackProvider } from "@btst/stack/context";
import { FormRenderer } from "@btst/stack/plugins/form-builder/client/components";
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";

const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000");

type PluginOverrides = {
  "form-builder": FormBuilderPluginOverrides;
};

export default function FormDemoPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [queryClient] = useState(() => getOrCreateQueryClient());
  const baseURL = getBaseURL();

  return (
    <QueryClientProvider client={queryClient}>
      <BetterStackProvider<PluginOverrides>
        basePath=""
        overrides={{
          "form-builder": {
            apiBaseURL: baseURL,
            apiBasePath: "/api/data",
            navigate: (path) => router.push(path),
            refresh: () => router.refresh(),
            Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
          },
        }}
      >
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>

            <div className="bg-card rounded-lg border p-6 shadow-sm">
              <FormRenderer
                slug={slug}
                onSuccess={(submission) => {
                  console.log("Form submitted successfully:", submission);
                  // submission.form contains successMessage and redirectUrl
                }}
                onError={(error) => {
                  console.error("Form submission error:", error);
                }}
                LoadingComponent={FormLoadingState}
                ErrorComponent={FormErrorState}
                className="space-y-6"
              />
            </div>
          </div>
        </main>
      </BetterStackProvider>
    </QueryClientProvider>
  );
}

function FormLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">Loading form...</p>
    </div>
  );
}

function FormErrorState({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <div>
        <h3 className="font-semibold text-lg">Form not found</h3>
        <p className="text-muted-foreground">
          {error.message || "The form you're looking for doesn't exist or is no longer available."}
        </p>
      </div>
    </div>
  );
}

