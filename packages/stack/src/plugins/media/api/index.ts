export * from "./plugin";

export {
	listAssets,
	getAssetById,
	listFolders,
	getFolderById,
	type AssetListParams,
	type AssetListResult,
	type FolderListParams,
} from "./getters";

export {
	createAsset,
	updateAsset,
	deleteAsset,
	createFolder,
	deleteFolder,
	type CreateAssetInput,
	type UpdateAssetInput,
	type CreateFolderInput,
} from "./mutations";

export { serializeAsset, serializeFolder } from "./serializers";

export { MEDIA_QUERY_KEYS, assetListDiscriminator } from "./query-key-defs";

export {
	localAdapter,
	type LocalStorageAdapterOptions,
} from "./adapters/local";

export type {
	StorageAdapter,
	DirectStorageAdapter,
	S3StorageAdapter,
	S3UploadToken,
	VercelBlobStorageAdapter,
	VercelBlobHandlerCallbacks,
	UploadOptions,
} from "./storage-adapter";
