export type Asset = {
	id: string;
	filename: string;
	originalName: string;
	mimeType: string;
	size: number;
	url: string;
	folderId?: string;
	alt?: string;
	tenantId?: string | null;
	createdAt: Date;
};

export type Folder = {
	id: string;
	name: string;
	parentId?: string;
	tenantId?: string | null;
	createdAt: Date;
};

export interface SerializedAsset extends Omit<Asset, "createdAt"> {
	createdAt: string;
}

export interface SerializedFolder extends Omit<Folder, "createdAt"> {
	createdAt: string;
}
