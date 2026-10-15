import { describe, it, expect } from 'vitest';
import { buildGccPayload, type ClaimedSubmission } from './buildPayload';

const claimed: ClaimedSubmission = {
  report_id: '0b8e7c1a-0000-4000-8000-000000000001',
  category: 'pothole',
  subtype: null,
  note: 'Deep pothole near the bus stop',
  lng: 80.204032,
  lat: 13.05202,
  gcc_street_id: '7553',
  gcc_road_name: 'Arunachalam Street',
  gcc_zone: '10',
  gcc_ward: '129',
  landmark: 'Near Kauvery Hospital',
  reporter_name: 'Asha',
  gender: 'female',
  photo_path: 'user/photo.jpg',
};

const opts = {
  siteUrl: 'https://civicly.example',
  photoUrl: 'https://supabase.example/storage/v1/object/public/report-photos/user/photo.jpg',
  imageDataUrl: 'data:image/jpeg;base64,AAAA',
};

describe('buildGccPayload', () => {
  it('fills GCC’s register form fields, never sharing mobile or email', () => {
    const p = buildGccPayload(claimed, opts);
    expect(p).toMatchObject({
      ComplainantName: 'Asha',
      ComplainantAddr: 'Arunachalam Street',
      MobileNo: '',
      Email: '',
      ComplaintTitle: 'Pot hole fill up / Repairs to the damaged surface',
      ComplaintType: '112',
      StreetId: '7553',
      Comp_Image: 'data:image/jpeg;base64,AAAA',
      latitude: '13.052020',
      longtitude: '80.204032',
      Landmark: 'Near Kauvery Hospital',
      gender: 'female',
    });
  });

  it('describes the issue with the note, street, ward/zone and links to the photo and live report', () => {
    const details = buildGccPayload(claimed, opts).ComplaintDetails;
    expect(details).toContain('Pothole');
    expect(details).toContain('Deep pothole near the bus stop');
    expect(details).toContain('Arunachalam Street');
    expect(details).toContain('Ward 129');
    expect(details).toContain('Zone 10');
    expect(details).toContain(opts.photoUrl);
    expect(details).toContain('https://civicly.example/home?focus=0b8e7c1a-0000-4000-8000-000000000001');
  });

  it('names the sub-type for "other" reports', () => {
    const details = buildGccPayload({ ...claimed, category: 'other', subtype: 'speed_breaker' }, opts).ComplaintDetails;
    expect(details).toContain('Unmarked speed breaker');
  });

  it('uses an anonymous label when the reporter gave no name', () => {
    expect(buildGccPayload({ ...claimed, reporter_name: null }, opts).ComplainantName).toBe('Anonymous (via Civicly Chennai)');
    expect(buildGccPayload({ ...claimed, reporter_name: '   ' }, opts).ComplainantName).toBe('Anonymous (via Civicly Chennai)');
  });

  it('falls back to the road name for the landmark, and sends no image when there is none', () => {
    const p = buildGccPayload({ ...claimed, landmark: null }, { ...opts, imageDataUrl: null });
    expect(p.Landmark).toBe('Arunachalam Street');
    expect(p.Comp_Image).toBe('');
  });
});
