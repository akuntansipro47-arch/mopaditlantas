import type { FamilyMember, Kelurahan, Profile, RT, RW, UserProfile } from '@/types';

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
};

const defaultProfile: Profile = {
  id: 'mock-profile',
  name: 'Profil Mock',
  address: '',
  phone: '',
  pic_name: '',
  website: '',
  ig: '',
  fb: '',
  twitter: '',
  logo_url: '',
};

export const mockApi = {
  async getPKMProfile(): Promise<Profile> {
    return read<Profile>('pkm_profile_v1', defaultProfile);
  },

  async updatePKMProfile(profile: Partial<Profile>): Promise<Profile> {
    const next = { ...(await this.getPKMProfile()), ...profile } as Profile;
    write('pkm_profile_v1', next);
    return next;
  },

  async getKelurahans(): Promise<Kelurahan[]> {
    return read<Kelurahan[]>('mock_kelurahan', []);
  },

  async getRWs(kelurahanId: number): Promise<RW[]> {
    const rows = read<RW[]>('mock_rw', []);
    return rows.filter((item) => Number(item.kelurahan_id) === Number(kelurahanId));
  },

  async getRTs(rwId: number): Promise<RT[]> {
    const rows = read<RT[]>('mock_rt', []);
    return rows.filter((item) => Number(item.rw_id) === Number(rwId));
  },

  async getUsers(): Promise<UserProfile[]> {
    return read<UserProfile[]>('mock_users', []);
  },

  async createUserProfile(user: Partial<UserProfile>): Promise<UserProfile> {
    const users = read<UserProfile[]>('mock_users', []);
    const nextUser: UserProfile = {
      id: user.id || `mock-user-${Date.now()}`,
      nik: user.nik || '',
      name: user.name || '',
      phone: user.phone || '',
      kelurahan_id: user.kelurahan_id,
      rw_id: user.rw_id,
      rt_id: user.rt_id,
      username: user.username || '',
      password_display: user.password_display,
      role: user.role || 'kader',
      is_active: user.is_active ?? true,
    };
    write('mock_users', [nextUser, ...users.filter((item) => item.id !== nextUser.id)]);
    return nextUser;
  },

  async updateUserStatus(id: string, isActive: boolean): Promise<void> {
    const users = read<UserProfile[]>('mock_users', []);
    write(
      'mock_users',
      users.map((item) => (item.id === id ? { ...item, is_active: isActive } : item)),
    );
  },

  async createEntry(entryData: any): Promise<any> {
    const entries = read<any[]>('mock_entries', []);
    const nextEntry = {
      id: entryData?.id || `mock-entry-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...entryData,
    };
    write('mock_entries', [nextEntry, ...entries]);
    return nextEntry;
  },

  async createFamilyMembers(members: Partial<FamilyMember>[]): Promise<Partial<FamilyMember>[]> {
    const current = read<Partial<FamilyMember>[]>('mock_family', []);
    const nextMembers = members.map((item, index) => ({
      id: item.id || `mock-family-${Date.now()}-${index}`,
      ...item,
    }));
    write('mock_family', [...current, ...nextMembers]);
    return nextMembers;
  },

  async getUserEntries(userId: string): Promise<any[]> {
    const entries = read<any[]>('mock_entries', []);
    const families = read<any[]>('mock_family', []);
    return entries
      .filter((item) => !userId || item.user_id === userId)
      .map((item) => ({
        ...item,
        family_members: families.filter((family) => family.entry_id === item.id),
        kelurahan: item.kelurahan || { name: '-' },
        rw: item.rw || { name: '-' },
        rt: item.rt || { name: '-' },
        kader: item.kader || { name: '-' },
      }));
  },
};
