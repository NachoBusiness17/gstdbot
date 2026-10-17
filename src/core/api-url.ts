export const DEFAULT_GSTD_API_URL = 'https://app.gstdtoken.com/api/v1';
const LEGACY_GSTD_API_URL = 'https://platform.gstdtoken.com/api/v1';

export function normalizeGstdApiUrl(configuredUrl?: string): string {
    const normalizedUrl = configuredUrl?.replace(/\/+$/, '');
    if (!configuredUrl || !normalizedUrl || normalizedUrl === LEGACY_GSTD_API_URL) {
        return DEFAULT_GSTD_API_URL;
    }
    return configuredUrl;
}
