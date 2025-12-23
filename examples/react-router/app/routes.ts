import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    layout("routes/pages/_layout.tsx", [
        route("pages/*", "routes/pages/index.tsx"),
    ]),
    route("form-demo/:slug", "routes/form-demo.$slug.tsx"),
    route("cms-example", "routes/cms-example.tsx"),
    route("api/data/*", "routes/api/data/route.ts"),
    route("sitemap.xml", "routes/sitemap.xml.ts"),
] satisfies RouteConfig;
