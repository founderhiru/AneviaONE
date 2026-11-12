/**
 * Demo family (EXPO_PUBLIC_DEMO_FAMILY=on, demo mode only): fictional Me, Dad and Mum to try
 * person switching. Off by default, so ordinary demo and production builds are unchanged.
 */
describe('demo family', () => {
  const load = (on: boolean) => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_DEMO_FAMILY = on ? 'on' : 'off';
    return {
      people: require('../services/people/peopleService'),
      subject: require('../services/people/activeSubject'),
      vault: require('../services/vault/demoVaultService'),
      obligations: require('../services/obligations/demoObligationsService'),
      docs: require('../services/documents/demoDocumentsService'),
    };
  };
  afterAll(() => {
    delete process.env.EXPO_PUBLIC_DEMO_FAMILY;
  });

  it('has no family unless switched on', async () => {
    const { people } = load(false);
    expect(await people.peopleService.refresh()).toEqual([]);
  });

  it('has Me, Dad and Mum, starts on Me, and switches', async () => {
    const { people, subject } = load(true);
    const list = await people.peopleService.refresh();
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Demo User', 'Dad', 'Mum']);
    expect(subject.getActiveSubjectId()).toBe('demo-person');
    people.peopleService.switchTo('demo-dad');
    expect(subject.getActiveSubjectId()).toBe('demo-dad');
    expect(people.getActivePerson().name).toBe('Dad');
    expect(people.isOwnRecord(people.getActivePerson())).toBe(false);
    expect(people.canAddReports(people.getActivePerson())).toBe(true);
  });

  it('keeps each person’s documents and reminders to themselves', async () => {
    const { vault, obligations } = load(true);
    const dad = await vault.demoVaultService.list('demo-dad');
    const mum = await vault.demoVaultService.list('demo-mum');
    const me = await vault.demoVaultService.list('demo-person');
    expect(dad.every((f: { subjectId: string }) => f.subjectId === 'demo-dad')).toBe(true);
    expect(dad.map((f: { kind: string }) => f.kind)).toEqual(expect.arrayContaining(['Aadhaar', 'PAN', 'Passport']));
    expect(mum.map((f: { kind: string }) => f.kind)).not.toContain('PAN');
    expect(me.some((f: { title: string }) => f.title.startsWith('Dad'))).toBe(false);
    const dadReminders = await obligations.demoObligationsService.list('demo-dad');
    expect(dadReminders.every((o: { subjectId: string }) => o.subjectId === 'demo-dad')).toBe(true);
    expect((await obligations.demoObligationsService.list('demo-person')).some((o: { title: string }) => o.title.startsWith('Dad'))).toBe(false);
  });

  it('does not show Me’s sample reports as Dad’s', async () => {
    const { people, docs } = load(true);
    await people.peopleService.refresh();
    expect((await docs.demoDocumentsService.listDocuments()).length).toBeGreaterThan(-1);
    people.peopleService.switchTo('demo-dad');
    expect(await docs.demoDocumentsService.listDocuments()).toEqual([]);
  });
});
