"use client";

import { useDeferredValue, useState } from "react";
import { useDebounce } from "@btst/stack/plugins/client/hooks";
import { Input } from "@workspace/ui/components/input";
import { useCompanies, useCompany, useContacts, useContact } from "../hooks";
import { Field, fullName, selectClass } from "./shared";

function SelectedCompanyOption({ id }: { id: string }) {
	const { data: company } = useCompany(id);
	return <option value={company.id}>{company.name}</option>;
}

function SelectedContactOption({ id }: { id: string }) {
	const { data: contact } = useContact(id);
	return <option value={contact.id}>{fullName(contact)}</option>;
}

export function CompanyRelationFields({ value = "" }: { value?: string }) {
	const [selected, setSelected] = useState(value);
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(useDebounce(search, 300));
	const { data: companies } = useCompanies({
		limit: 200,
		search: deferredSearch || undefined,
	});
	return (
		<div
			className="space-y-4"
			role="group"
			aria-label="Company selection"
			aria-busy={search !== deferredSearch}
		>
			<Field label="Search companies">
				{(id) => (
					<Input
						id={id}
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Company name, domain, or phone"
					/>
				)}
			</Field>
			<Field label="Company">
				{(id) => (
					<select
						id={id}
						name="companyId"
						className={selectClass}
						value={selected}
						onChange={(event) => setSelected(event.target.value)}
					>
						<option value="">No linked company</option>
						{selected &&
							!companies.items.some((company) => company.id === selected) && (
								<SelectedCompanyOption id={selected} />
							)}
						{companies.items.map((company) => (
							<option key={company.id} value={company.id}>
								{company.name}
							</option>
						))}
					</select>
				)}
			</Field>
		</div>
	);
}

export function ContactRelationFields({ value = "" }: { value?: string }) {
	const [selected, setSelected] = useState(value);
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(useDebounce(search, 300));
	const { data: contacts } = useContacts({
		limit: 200,
		search: deferredSearch || undefined,
	});
	return (
		<div
			className="space-y-4"
			role="group"
			aria-label="Contact selection"
			aria-busy={search !== deferredSearch}
		>
			<Field label="Search contacts">
				{(id) => (
					<Input
						id={id}
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Name, email, or any contact detail"
					/>
				)}
			</Field>
			<Field label="Contact">
				{(id) => (
					<select
						id={id}
						name="contactId"
						className={selectClass}
						value={selected}
						onChange={(event) => setSelected(event.target.value)}
					>
						<option value="">No linked contact</option>
						{selected &&
							!contacts.items.some((contact) => contact.id === selected) && (
								<SelectedContactOption id={selected} />
							)}
						{contacts.items.map((contact) => (
							<option key={contact.id} value={contact.id}>
								{fullName(contact)}
							</option>
						))}
					</select>
				)}
			</Field>
		</div>
	);
}
