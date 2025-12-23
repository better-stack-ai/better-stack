import { useParams, useNavigate, Link } from "react-router";
import type { Route } from "./+types/index";
import { QueryClientProvider } from "@tanstack/react-query";
import { BetterStackProvider } from "@btst/stack/context";
import { FormRenderer } from "@btst/stack/plugins/form-builder/client/components";
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client";
import { Navbar } from "~/components/navbar";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { getOrCreateQueryClient } from "~/lib/query-client";

const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? window.location.origin
    : "http://localhost:3000";

type PluginOverrides = {
  "form-builder": FormBuilderPluginOverrides;
};

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `Form Demo - ${params.slug}` },
    { name: "description", content: "Form demo page" },
  ];
}

export default function FormDemoPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const queryClient = getOrCreateQueryClient();
  const baseURL = getBaseURL();

  if (!slug) {
    return (
      <>
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p>No form slug provided</p>
        </main>
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BetterStackProvider<PluginOverrides>
        basePath=""
        overrides={{
          "form-builder": {
            apiBaseURL: baseURL,
            apiBasePath: "/api/data",
            navigate: (path) => navigate(path),
            Link: ({ href, children, className, ...props }) => (
              <Link to={href || "/"} className={className} {...props}>
                {children}
              </Link>
            ),
          },
        }}
      >
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => navigate(-1)}
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

