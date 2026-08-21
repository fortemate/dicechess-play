export const getPieceImage = (value: string): string => {
	const color = value === value.toUpperCase() ? 'w' : 'b';
	const piece = value.toUpperCase();
	return `/pieces/cburnett/${color}${piece}.svg`;
};
