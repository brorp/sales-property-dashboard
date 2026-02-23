declare module "qrcode-terminal" {
    const qrcode: {
        generate(text: string, options?: { small?: boolean }, cb?: () => void): void;
    };
    export default qrcode;
}
