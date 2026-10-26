import { createHash,randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';
export function hashPin(pin:string):string {
    const salt=randomBytes(16).toString('hex');
    return 'scrypt$'+salt+'$'+scryptSync(pin,salt,32).toString('hex');
}
export function verifyPin(pin:string,encoded:string):boolean {
    try {
        if(encoded.startsWith('scrypt$')){
            const [,salt,hash]=encoded.split('$');
            if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(hash))return false;
            return timingSafeEqual(scryptSync(pin,salt,32),Buffer.from(hash,'hex'));
        }
        // Existing operators can log in; login migrates this legacy digest in place.
        if(!/^[a-f0-9]{64}$/.test(encoded))return false;
        return timingSafeEqual(createHash('sha256').update(pin+'gstd-node-salt-2026').digest(),Buffer.from(encoded,'hex'));
    }catch{return false;}
}
