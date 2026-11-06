"use client";
import { Award } from "lucide-react";
import { useCertificate } from "../../hooks";
import { SchoolShell } from "./school-shared";

export function CertificatePage({ certificateId }: { certificateId: string }) {
	const { data } = useCertificate(certificateId);
	return (
		<SchoolShell title="Certificate verification">
			<article className="school-certificate">
				<Award size={40} aria-hidden="true" />
				<p>Verified completion</p>
				<h2>{data.courseTitle}</h2>
				<p>All lessons in this course have been completed.</p>
				<dl>
					<div>
						<dt>Completed</dt>
						<dd>
							{new Date(data.completedAt).toLocaleDateString("en-US", {
								timeZone: "UTC",
							})}
						</dd>
					</div>
					<div>
						<dt>Certificate ID</dt>
						<dd>{data.certificateId}</dd>
					</div>
				</dl>
			</article>
		</SchoolShell>
	);
}
