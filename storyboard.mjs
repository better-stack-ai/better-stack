const userId = 'partner-field-notes-demo';
const code = 'field-notes-demo';
const base = '/api/data/affiliate';
let affiliate, commission, payout, trackingLink;
async function session(context, id) {
  await context.addCookies([{name:'btst.example_session',value:`mock-session-${id}`,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
}
async function json(response) {
  if (!response.ok()) throw new Error(`${response.status()}: ${await response.text()}`);
  return response.json();
}
export const config = {
  baseURL: 'http://localhost:3006',
  outDir: '/tmp/affiliate-103-demo',
  videoName: 'affiliate-walkthrough',
  viewport: {width:1440,height:1000},
  contextOptions: {baseURL:'http://localhost:3006'},
  captionStyle: {accent:'#2563eb',fontSize:'18px'},
  signIn: async ({context}) => session(context,userId),
};
export const beats = [
  {name:'application', async run({page,goto,caption}) {
    await goto('/pages/affiliate/apply');
    await page.getByLabel('Name',{exact:true}).fill('Jane at Field Notes');
    await page.getByLabel('Email',{exact:true}).fill('jane@fieldnotes.example');
    await page.getByLabel(/^Referral code/).fill(code);
    await page.getByLabel(/^Payout details/).fill('Bank transfer; payment details confirmed with the program administrator.');
    await caption('Partners apply with a referral code and payment instructions.',3400);
  }},
  {name:'approval', async run({page,context,goto,caption}) {
    await page.getByRole('button',{name:'Submit application',exact:true}).click();
    await page.getByText('Application submitted',{exact:true}).waitFor();
    await session(context,'admin-demo');
    const result=await json(await context.request.get(base+'/affiliates'));
    affiliate=result.items.find(item=>item.code===code);
    await goto(`/pages/affiliate/admin/affiliates/${affiliate.id}`);
    await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('approved');
    await page.getByRole('button',{name:'Save profile',exact:true}).click();
    await page.getByText('Affiliate profile saved',{exact:true}).waitFor();
    await caption('Administrators approve partners and can set individual commission rules.',3600);
  }},
  {name:'referral-link', async run({page,context,goto,caption}) {
    await session(context,userId);
    await goto('/pages/affiliate/portal');
    await page.getByLabel(/^Landing page path/).fill('/pages/affiliate/portal');
    await page.getByRole('button',{name:'Generate referral link',exact:true}).click();
    const link=await page.getByLabel('Tracking link',{exact:true}).inputValue();
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    await page.getByRole('button',{name:'Copy referral link',exact:true}).click();
    await page.getByText('Referral link copied',{exact:true}).waitFor();
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    if(copied!==link) throw new Error('Copied referral link does not match');
    await caption('Partners generate and copy links to a specific landing page.',3600);
    trackingLink = link;
  }},
  {name:'commission-review', async run({page,context,goto,caption}) {
    await page.goto(trackingLink);
    await page.getByRole('heading',{name:'Affiliate portal',exact:true}).waitFor();
    const click=(await context.cookies()).find(cookie=>cookie.name==='btst_affiliate');
    await session(context,'admin-demo');
    const converted=await json(await context.request.post(base+'/conversions',{headers:{cookie:`btst.example_session=mock-session-admin-demo; btst_affiliate=${click.value}`},data:{externalRef:'demo-order-field-notes',amount:12900,currency:'USD'}}));
    commission=converted.commission;
    await goto('/pages/affiliate/admin/commissions');
    await page.getByRole('button',{name:`Approve commission ${commission.id}`,exact:true}).waitFor();
    await caption('A verified $129 checkout creates a pending $25.80 commission.',3800);
  }},
  {name:'payout-reservation', async run({page,context,goto,caption}) {
    await page.getByRole('button',{name:`Approve commission ${commission.id}`,exact:true}).click();
    await page.getByText('Commission approved',{exact:true}).waitFor();
    await goto('/pages/affiliate/admin/payouts');
    await page.getByLabel('Affiliate ID',{exact:true}).fill(affiliate.id);
    await page.getByLabel('Currency',{exact:true}).fill('USD');
    await page.getByRole('button',{name:'Create payout batch',exact:true}).click();
    await page.getByText('Payout batch created. Arrange the payment, then record its result below.',{exact:true}).waitFor();
    payout=(await json(await context.request.get(base+'/payouts',{params:{affiliateId:affiliate.id}}))).items[0];
    await caption('Payout batches reserve approved commissions so they cannot be paid twice.',3800);
  }},
  {name:'manual-payment', async run({page,caption}) {
    await page.getByRole('button',{name:`Record payout result ${payout.id}`,exact:true}).click();
    await page.getByRole('combobox',{name:'Payment result',exact:true}).selectOption('sent');
    await page.getByLabel('Payment reference',{exact:true}).fill('BANK-2026-103');
    await page.getByRole('button',{name:'Save payout result',exact:true}).click();
    await page.getByText('Payout result recorded',{exact:true}).waitFor();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button',{name:'Export CSV',exact:true}).click();
    await (await downloading).saveAs('/tmp/affiliate-103-demo/payouts.csv');
    await caption('Record an external payment reference and export the accounting CSV.',3800);
  }},
  {name:'partner-earnings', async run({page,context,goto,caption}) {
    await session(context,userId);
    await goto('/pages/affiliate/portal');
    await page.getByRole('region',{name:'Commission totals',exact:true}).waitFor();
    await page.getByText('BANK-2026-103',{exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));
    await caption('Partners see paid commissions and the matching payout history.',3800);
  }},
];
