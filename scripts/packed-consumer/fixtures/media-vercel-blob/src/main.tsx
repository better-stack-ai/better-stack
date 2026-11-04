import { vercelBlobUpload } from "@btst/plugin-media/client/vercel-blob";
import { mountMedia } from "./media-page";
mountMedia({ uploadMode: "vercel-blob", uploadBlob: vercelBlobUpload });
