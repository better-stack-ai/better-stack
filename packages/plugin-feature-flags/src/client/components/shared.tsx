"use client";

import type { ReactNode } from "react";
import type { FallbackProps } from "@btst/stack/client/components";

export function FlagsPage({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="feature-flags-page">
			<header className="ff-header">
				<div>
					<h1>{title}</h1>
					{description && <p>{description}</p>}
				</div>
				{action}
			</header>
			{children}
		</section>
	);
}

export function FlagsLoading() {
	return (
		<section className="feature-flags-page" role="status">
			<h1>Feature flags</h1>
			<p>Loading flags…</p>
		</section>
	);
}

export function FlagsError({ resetErrorBoundary }: FallbackProps) {
	return (
		<section className="feature-flags-page" role="alert">
			<h1>Feature flags unavailable</h1>
			<p>Flags could not be loaded. Check your access and try again.</p>
			<button type="button" onClick={resetErrorBoundary}>
				Try again
			</button>
		</section>
	);
}

export function FlagsNotFound({ message }: { message: string }) {
	return (
		<section className="feature-flags-page">
			<h1>Flag not found</h1>
			<p>{message}</p>
		</section>
	);
}

export function Field({
	id,
	label,
	hint,
	children,
}: {
	id: string;
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="ff-field">
			<label htmlFor={id}>{label}</label>
			{children}
			{hint && (
				<p id={`${id}-hint`} className="ff-note">
					{hint}
				</p>
			)}
		</div>
	);
}

export function Rollout({ percent }: { percent: number }) {
	return (
		<div className="ff-rollout">
			<span>{percent}% rollout</span>
			<meter aria-label="Rollout percentage" min={0} max={100} value={percent}>
				{percent}%
			</meter>
		</div>
	);
}
