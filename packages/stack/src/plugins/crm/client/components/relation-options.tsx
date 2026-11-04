"use client";

import { useCompany, useContact } from "../hooks";
import { fullName } from "./shared";

export function SelectedCompanyOption({ id }: { id: string }) {
	const { data: company } = useCompany(id);
	return <option value={company.id}>{company.name}</option>;
}

export function SelectedContactOption({ id }: { id: string }) {
	const { data: contact } = useContact(id);
	return <option value={contact.id}>{fullName(contact)}</option>;
}
