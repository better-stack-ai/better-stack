export const DefaultLink = (props: React.ComponentProps<"a">) => {
	return <a {...props} />;
};

export const DefaultImage = (
	props: React.ImgHTMLAttributes<HTMLImageElement>,
) => {
	return <img {...props} />;
};
