import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Twitter } from "lucide-react";
import { SOCIALS } from "@/constants";

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Docs Layout: app/(home)/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  githubUrl: SOCIALS.Github,
  nav: {
    title: (
      <>
        <span>BTST</span> 
      </>
    ),
    url:"https://www.better-stack.ai"
  },
  // see https://fumadocs.dev/docs/ui/navigation/links
  links: [
    {
      url: "https://x.com/olliethedev",
      text: "Twitter",
      type: "icon",
      icon: <Twitter />,
      external: true
  },
  ]
};
