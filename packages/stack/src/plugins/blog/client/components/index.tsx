"use client";
import { HomePageComponent as PostListPageImpl } from "./pages/home-page";
import { NewPostPageComponent as NewPostPageImpl } from "./pages/new-post-page";
import { PostPageComponent as PostPageImpl } from "./pages/post-page";
import { EditPostPageComponent as EditPostPageImpl } from "./pages/edit-post-page";

// Re-export to ensure the client boundary is preserved
export const PostListPage = PostListPageImpl;
export const NewPostPage = NewPostPageImpl;
export const PostPage = PostPageImpl;
export const EditPostPage = EditPostPageImpl;
