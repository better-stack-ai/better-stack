"use client";

import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type FormEvent,
} from "react";
import { PermissionRouteAccess } from "@btst/stack/client/components";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { updateCampaignSchema } from "../../../schemas";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { MarkdownEditor } from "@workspace/ui/components/markdown-editor";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { newsletterPermissions } from "../../../permissions";
import type { Campaign } from "../../../types";
import type { CampaignInput } from "../../../query-keys";
import {
	useCampaign,
	useCreateCampaign,
	useDeleteCampaign,
	useScheduleCampaign,
	useSendCampaign,
	useTestCampaign,
	useUpdateCampaign,
} from "../../hooks";
import type { NewsletterPluginOverrides } from "../../overrides";
import { NewsletterMarkdownPreview } from "../markdown-preview";
import { CampaignRecovery } from "../campaign-recovery";
import { NEWSLETTER_PLUGIN_ID } from "../../constants";
import {
	Field,
	NewsletterLoading,
	NewsletterPage,
	Status,
	selectClass,
} from "../shared";

const emptyCampaign: CampaignInput = {
	subject: "",
	fromName: "",
	fromEmail: "",
	replyTo: "",
	body: "",
	format: "markdown",
	tags: [],
};

export function EditCampaignPage({ id }: { id?: string }) {
	return id ? (
		<ExistingCampaign id={id} />
	) : (
		<CampaignForm initial={emptyCampaign} />
	);
}

function ExistingCampaign({ id }: { id: string }) {
	const { data: campaign } = useCampaign(id);
	const initial = {
		...campaign,
		previewText: campaign.previewText ?? "",
		replyTo: campaign.replyTo ?? undefined,
	};
	return campaign.status === "draft" ? (
		<PermissionRouteAccess
			permission={newsletterPermissions.campaign.update({
				campaignId: id,
				status: campaign.status,
			})}
			LoadingComponent={NewsletterLoading}
		>
			<CampaignForm key={id} initial={initial} campaign={campaign} />
		</PermissionRouteAccess>
	) : (
		<CampaignForm key={id} initial={initial} campaign={campaign} />
	);
}

function CampaignForm({
	initial,
	campaign,
}: {
	initial: CampaignInput;
	campaign?: Campaign;
}) {
	const id = useId();
	const { Link, resolve, navigate } =
		usePluginSiteNavigation(NEWSLETTER_PLUGIN_ID);
	const {
		uploadImage,
		uploadFile,
		imagePicker: ImagePicker,
		imageInputField: ImageInputField,
		CampaignSource,
	} = usePluginOverrides<NewsletterPluginOverrides>(NEWSLETTER_PLUGIN_ID);
	const [values, setValues] = useState<CampaignInput>(initial);
	const [mode, setMode] = useState<"markdown" | "rich" | "preview">("markdown");
	const [source, setSource] = useState<{ slug: string; id: string }>();
	const [testEmail, setTestEmail] = useState("");
	const [scheduledAt, setScheduledAt] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const create = useCreateCampaign();
	const update = useUpdateCampaign();
	const send = useSendCampaign();
	const test = useTestCampaign();
	const schedule = useScheduleCampaign();
	const remove = useDeleteCampaign();
	const formRef = useRef<HTMLFormElement>(null);
	const insertImageRef = useRef<((url: string) => void) | null>(null);
	const pending =
		create.isPending ||
		update.isPending ||
		send.isPending ||
		test.isPending ||
		schedule.isPending ||
		remove.isPending;
	const readOnly = !!campaign && campaign.status !== "draft";
	const insertImage = (url: string) => {
		if (!url || readOnly || pending) return;
		if (mode === "rich") insertImageRef.current?.(url);
		else
			setValues((current) => ({
				...current,
				body: `${current.body}\n\n![Image](${url})`,
			}));
	};
	useRegisterPageAIContext({
		routeName: "newsletter-campaign-editor",
		pageDescription: JSON.stringify({
			page: "Campaign editor. Draft only supplied fields; saving and sending remain user actions.",
			status: campaign?.status ?? "new",
			subject: values.subject,
			previewText: values.previewText ?? "",
			body: values.body.slice(0, 10000),
		}).slice(0, 16000),
		clientTools: readOnly
			? undefined
			: {
					fillCampaignForm: async (input: unknown) => {
						if (pending)
							return {
								success: false,
								message: "Wait for the current campaign operation.",
							};
						const parsed = updateCampaignSchema
							.pick({ subject: true, previewText: true, body: true })
							.strict()
							.safeParse(input);
						if (!parsed.success)
							return {
								success: false,
								message: "Invalid campaign draft fields.",
							};
						setValues((current) => ({
							...current,
							...parsed.data,
							...(parsed.data.body !== undefined ? { format: "markdown" } : {}),
						}));
						if (parsed.data.body !== undefined) setMode("markdown");
						return {
							success: true,
							message: "Draft updated. Review it before saving or sending.",
						};
					},
				},
	});
	const canDelete =
		campaign?.status === "draft" || campaign?.status === "scheduled";
	useEffect(() => {
		if (campaign) return;
		const params = new URLSearchParams(window.location.search);
		const slug = params.get("fromPostSlug");
		const postId = params.get("fromPostId");
		if (slug && postId) setSource({ slug, id: postId });
	}, [campaign]);
	const loadSource = useCallback(
		(subject: string, body: string) =>
			setValues((current) => ({ ...current, subject, body })),
		[],
	);
	const change = <K extends keyof CampaignInput>(
		key: K,
		value: CampaignInput[K],
	) => setValues((current) => ({ ...current, [key]: value }));
	const run = async (action: () => Promise<void>) => {
		setError("");
		setMessage("");
		try {
			await action();
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The campaign could not be updated. Try again.",
			);
		}
	};
	const save = async () => {
		if (!formRef.current?.reportValidity()) return;
		if (!values.body.trim())
			throw new Error("Write an email body before saving.");
		const data = {
			...values,
			replyTo: values.replyTo || undefined,
			tags: values.tags?.map((tag) => tag.trim()).filter(Boolean),
		};
		if (campaign) {
			await update.mutateAsync({
				id: campaign.id,
				data: { ...data, replyTo: values.replyTo || null },
			});
			return campaign.id;
		}
		const created = await create.mutateAsync(data);
		await navigate(`newsletter/campaigns/${created.id}`);
		return created.id;
	};
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void run(async () => {
			await save();
			setMessage("Campaign saved");
		});
	};
	return (
		<NewsletterPage
			title={campaign ? campaign.subject : "New campaign"}
			description="A clear subject, a useful message, and the right audience."
			action={
				campaign && (
					<PermissionAccess permission={newsletterPermissions.analytics.read()}>
						<Button asChild variant="outline">
							<Link
								href={resolve(`newsletter/campaigns/${campaign.id}/stats`).href}
							>
								View results
							</Link>
						</Button>
					</PermissionAccess>
				)
			}
		>
			{campaign &&
				(campaign.status === "sending" || campaign.status === "sent") && (
					<PermissionAccess
						permission={newsletterPermissions.campaign.send({
							campaignId: campaign.id,
							status: campaign.status,
						})}
					>
						<CampaignRecovery id={campaign.id} status={campaign.status} />
					</PermissionAccess>
				)}
			{source && CampaignSource && (
				<CampaignSource
					slug={source.slug}
					postId={source.id}
					onLoad={loadSource}
				/>
			)}
			{campaign && (
				<div className="flex flex-wrap items-center gap-3">
					<Status value={campaign.status} />
					{campaign.scheduledAt && (
						<p className="text-sm text-muted-foreground">
							Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}
						</p>
					)}
					{readOnly && (
						<p className="text-sm text-muted-foreground">
							This campaign is {campaign.status}. Its content can no longer be
							edited.
						</p>
					)}
				</div>
			)}
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			<form
				ref={formRef}
				onSubmit={submit}
				className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]"
			>
				<div className="min-w-0 space-y-5">
					<Field id={`${id}-subject`} label="Subject">
						<Input
							id={`${id}-subject`}
							required
							maxLength={500}
							value={values.subject}
							readOnly={readOnly || pending}
							onChange={(e) => change("subject", e.target.value)}
							className="min-h-12 text-lg"
							placeholder="What should your readers know?"
						/>
					</Field>
					<Field id={`${id}-preview-text`} label="Preview text">
						<Input
							id={`${id}-preview-text`}
							maxLength={500}
							value={values.previewText ?? ""}
							readOnly={readOnly || pending}
							onChange={(event) => change("previewText", event.target.value)}
						/>
					</Field>
					<div className="space-y-3">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<label htmlFor={`${id}-body`} className="text-sm font-medium">
								Email body
							</label>
							<div
								className="flex flex-wrap gap-1"
								role="group"
								aria-label="Email editor mode"
								inert={pending}
							>
								<Button
									type="button"
									size="sm"
									variant={mode === "markdown" ? "secondary" : "ghost"}
									aria-pressed={mode === "markdown"}
									onClick={() => setMode("markdown")}
								>
									{values.format === "html" ? "HTML" : "Markdown"}
								</Button>
								{values.format !== "html" && !readOnly && (
									<Button
										type="button"
										size="sm"
										variant={mode === "rich" ? "secondary" : "ghost"}
										aria-pressed={mode === "rich"}
										onClick={() => setMode("rich")}
									>
										Rich text
									</Button>
								)}
								<Button
									type="button"
									size="sm"
									variant={mode === "preview" ? "secondary" : "ghost"}
									aria-pressed={mode === "preview"}
									onClick={() => setMode("preview")}
								>
									Preview
								</Button>
							</div>
						</div>
						{values.format !== "html" &&
							mode !== "preview" &&
							!readOnly &&
							(ImagePicker || ImageInputField) && (
								<div
									className="flex justify-end"
									inert={pending}
									aria-label="Campaign images"
								>
									{ImagePicker ? (
										<ImagePicker onSelect={insertImage} />
									) : ImageInputField ? (
										<ImageInputField value="" onChange={insertImage} />
									) : null}
								</div>
							)}
						{mode === "markdown" ? (
							<Textarea
								id={`${id}-body`}
								rows={20}
								value={values.body}
								readOnly={readOnly || pending}
								onChange={(e) => change("body", e.target.value)}
								placeholder="Write your newsletter…"
								className="min-h-[420px] resize-y leading-relaxed"
							/>
						) : mode === "rich" ? (
							<div
								className="min-h-[420px] rounded-lg border"
								role="group"
								aria-label="Email body rich text editor"
								inert={pending}
							>
								<MarkdownEditor
									value={values.body}
									onChange={(body) => change("body", body)}
									uploadImage={uploadFile ?? uploadImage}
									insertImageRef={insertImageRef}
								/>
							</div>
						) : (
							<div
								className="min-h-[420px] overflow-hidden rounded-lg border bg-background p-5"
								aria-label="Email preview"
							>
								{values.format === "html" ? (
									<iframe
										title="Email preview"
										sandbox=""
										srcDoc={values.body}
										className="h-[420px] w-full"
									/>
								) : (
									<NewsletterMarkdownPreview
										markdown={
											values.body || "Your email preview will appear here."
										}
									/>
								)}
								<p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
									An unsubscribe link is added automatically to each
									subscriber's email.
								</p>
							</div>
						)}
					</div>
				</div>
				<aside className="min-w-0 space-y-6">
					<fieldset disabled={readOnly || pending} className="space-y-4">
						<legend className="mb-4 text-lg font-medium">
							Sender and audience
						</legend>
						<Field id={`${id}-from-name`} label="From name">
							<Input
								id={`${id}-from-name`}
								required
								maxLength={200}
								value={values.fromName}
								onChange={(e) => change("fromName", e.target.value)}
							/>
						</Field>
						<Field id={`${id}-from-email`} label="From email">
							<Input
								id={`${id}-from-email`}
								required
								type="email"
								value={values.fromEmail}
								onChange={(e) => change("fromEmail", e.target.value)}
							/>
						</Field>
						<Field id={`${id}-reply-to`} label="Reply-to">
							<Input
								id={`${id}-reply-to`}
								type="email"
								value={values.replyTo ?? ""}
								onChange={(e) => change("replyTo", e.target.value)}
							/>
						</Field>
						<Field
							id={`${id}-tags`}
							label="Audience tags"
							hint="Leave empty to reach all subscribed readers. Separate tags with commas; readers matching any tag are included."
						>
							<Input
								id={`${id}-tags`}
								value={values.tags?.join(", ") ?? ""}
								onChange={(e) =>
									change(
										"tags",
										e.target.value.split(",").map((tag) => tag.trim()),
									)
								}
								onBlur={() => change("tags", values.tags?.filter(Boolean))}
							/>
						</Field>
						<Field id={`${id}-format`} label="Body format">
							<select
								id={`${id}-format`}
								className={selectClass}
								value={values.format ?? "markdown"}
								onChange={(e) => {
									change("format", e.target.value as "markdown" | "html");
									setMode("markdown");
								}}
							>
								<option value="markdown">Markdown</option>
								<option value="html">HTML</option>
							</select>
						</Field>
					</fieldset>
					{!readOnly && (
						<Button className="w-full" type="submit" disabled={pending}>
							{pending ? "Saving…" : "Save draft"}
						</Button>
					)}
				</aside>
			</form>
			{campaign && !readOnly && (
				<section
					aria-label="Campaign delivery"
					className="grid gap-6 border-t pt-8 md:grid-cols-3"
				>
					<div className="space-y-3">
						<h2 className="text-lg font-medium">Send a test</h2>
						<Field id={`${id}-test`} label="Test email address">
							<Input
								id={`${id}-test`}
								type="email"
								value={testEmail}
								onChange={(e) => setTestEmail(e.target.value)}
							/>
						</Field>
						<PermissionAccess
							permission={newsletterPermissions.campaign.test({
								campaignId: campaign.id,
								status: campaign.status,
							})}
						>
							<Button
								variant="outline"
								disabled={pending || !testEmail}
								onClick={() =>
									void run(async () => {
										const saved = await save();
										if (!saved) return;
										await test.mutateAsync({ id: saved, email: testEmail });
										setMessage("Test email sent");
									})
								}
							>
								Send test email
							</Button>
						</PermissionAccess>
					</div>
					<div className="space-y-3">
						<h2 className="text-lg font-medium">Schedule delivery</h2>
						<Field
							id={`${id}-schedule`}
							label="Scheduled send time"
							hint="Uses your local time zone."
						>
							<Input
								id={`${id}-schedule`}
								type="datetime-local"
								value={scheduledAt}
								onChange={(e) => setScheduledAt(e.target.value)}
							/>
						</Field>
						<PermissionAccess
							permission={newsletterPermissions.campaign.schedule({
								campaignId: campaign.id,
								status: campaign.status,
							})}
						>
							<Button
								variant="outline"
								disabled={pending || !scheduledAt}
								onClick={() =>
									void run(async () => {
										const date = new Date(scheduledAt);
										if (
											!Number.isFinite(date.getTime()) ||
											date.getTime() <= Date.now()
										)
											throw new Error(
												"Choose a scheduled send time in the future.",
											);
										const saved = await save();
										if (!saved) return;
										await schedule.mutateAsync({
											id: saved,
											scheduledAt: date.toISOString(),
										});
										setMessage("Campaign scheduled");
									})
								}
							>
								Schedule campaign
							</Button>
						</PermissionAccess>
					</div>
					<div className="space-y-3">
						<h2 className="text-lg font-medium">Ready to send?</h2>
						<p className="text-sm text-muted-foreground">
							Only subscribed, confirmed readers in your audience receive this
							email.
						</p>
						<PermissionAccess
							permission={newsletterPermissions.campaign.send({
								campaignId: campaign.id,
								status: campaign.status,
							})}
						>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button disabled={pending}>Send campaign</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Send this campaign now?</AlertDialogTitle>
										<AlertDialogDescription>
											This sends your message to all eligible subscribers
											{values.tags?.filter(Boolean).length
												? ` matching ${values.tags.filter(Boolean).join(", ")}`
												: ""}
											. Sent emails cannot be recalled.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={() =>
												void run(async () => {
													const saved = await save();
													if (!saved) return;
													await send.mutateAsync(saved);
													setMessage("Campaign sent");
												})
											}
										>
											Send now
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</PermissionAccess>
					</div>
				</section>
			)}
			{campaign && canDelete && (
				<div className="border-t pt-6">
					<PermissionAccess
						permission={newsletterPermissions.campaign.delete({
							campaignId: campaign.id,
							status: campaign.status,
						})}
					>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" disabled={pending}>
									{campaign.status === "scheduled"
										? "Delete scheduled campaign"
										: "Delete draft"}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{campaign.status === "scheduled"
											? "Delete scheduled campaign?"
											: "Delete campaign draft?"}
									</AlertDialogTitle>
									<AlertDialogDescription>
										“{campaign.subject}” and its content will be removed.
										{campaign.status === "scheduled" &&
											" Deleting this campaign cancels its scheduled delivery."}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={() =>
											void run(async () => {
												await remove.mutateAsync(campaign.id);
												await navigate("newsletter/campaigns");
											})
										}
									>
										Delete campaign
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</PermissionAccess>
				</div>
			)}
		</NewsletterPage>
	);
}
