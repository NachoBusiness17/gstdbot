/** Removes HTML tags until none remain, then drops stray angle brackets. */
export function stripTags(input: string): string {
    let s = input;
    let prev: string;
    do {
        prev = s;
        s = s.replace(/<[^<>]*>/g, '');
    } while (s !== prev);
    return s.replace(/[<>]/g, '');
}
