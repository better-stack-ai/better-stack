"use client";

import { useFeedbackRoadmap } from "../../hooks";
import { FeedbackPostCard } from "../post-card";
import { FeedbackPage, statusLabels } from "../shared";

export function FeedbackRoadmapPage() {
	const { data } = useFeedbackRoadmap();
	return (
		<FeedbackPage title="Roadmap">
			<p className="text-muted-foreground">
				Follow requests from planning to release.
			</p>
			<div className="grid min-w-0 gap-6 lg:grid-cols-3">
				{(["planned", "in_progress", "shipped"] as const).map((status) => (
					<section
						key={status}
						className="min-w-0 space-y-4"
						aria-label={statusLabels[status]}
					>
						<h2 className="text-xl font-semibold">{statusLabels[status]}</h2>
						{data[status].length ? (
							data[status].map((post) => (
								<FeedbackPostCard
									page="feedbackRoadmap"
									key={post.id}
									post={post}
								/>
							))
						) : (
							<p className="rounded-lg border p-5 text-sm text-muted-foreground">
								No requests in this stage.
							</p>
						)}
					</section>
				))}
			</div>
		</FeedbackPage>
	);
}
