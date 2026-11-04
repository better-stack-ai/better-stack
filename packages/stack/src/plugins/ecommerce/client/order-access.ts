export function orderTokenKey(
	orderId: string,
	endpoint: { baseURL: string; basePath: string },
) {
	return `btst:ecommerce:order:${JSON.stringify(endpoint)}:${orderId}`;
}
