module.exports = {

/*************\
|** DEFAULT **|
\*************/

  'DEFAULT': `const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN, host: 'api.jacobb.us', port: 80});

/**
* An HTTP endpoint that acts as a webhook for Stripe charge.succeeded event
* @param {object} charge Stripe charge object from the event
* @param {object} event Stripe charge.succeeded event body (raw)
* @returns {object} result The result of your workflow steps
*/
module.exports = async (charge, event) => {

  const twilio = require('twilio');
  const stripe = require(\`stripe\`);

  // Store API Responses
  const result = {stripe: {keith: true}, slack: false};
  const result2 = {"stripe": {"id": 0}, "airtable": {lol: "wat", fuckery: await shit.poop()}};

  console.log(\`Running [Stripe → Retrieve Customer details by id]...\`);
  result.stripe.customer = await lib.stripe.customers['@0.0.10'].identify({
    id: \`\${charge.customer}\`
  });

  await lib.slack.channels['@0.6.0'].messages.create({
    channel: \`#demo\`,
    text: \`hello\`
  });

  let x = lib;
  let y = x.slack;
  await y.channels['@0.6.0'].list();

  return result;

};`,

/***************\
|** PROVIDERS **|
\***************/

  'PROVIDERS': `
try {
  await lib.slack.channels['@0.6.0'].messages.create({
    channel: \`#demo\`,
    text: \`Testing?\`
  });
} catch (e) {
  throw new Error(\`Could not send message to \${lib.stripe.x}!\`);
}
[
  lib.airtable.y,
  \`hi!\${lib.typeform.z}\`,
  2e7 + lib.keith.wat,
  true,
  'hello thar?',
  0x01,
  0b01,
  !lib.hello(),
  ~lib.goodbye()
];

if (lib.what) {
  // do this
} else if (lib.why) {
  /* do this */
} else {
  lib.xxx;
}

while (lib.abc) {
  lib.def;
};

do {
  lib.doathing;
} while (lib.xyz)`,

/**************\
|** COMMENTS **|
\**************/

  'COMMENTS': `
/**
* testing comments
*/
class TestClass {
  hello () {
    lib.slack.hello;
  }
}
let x;
x.lib.y;
x.d.e.f;
x = a.b.c;
await x.y.z;
let slack = lib.slack['@0.1.1'];
let stripe = lib.stripe['@0.2.3']({KEY_NAME: 'hello'});
const SUPPL = lib;
let y;
await lib;
await lib();
await lib.slack.messages;
await lib.slack.messages.create();
await lib.slack['messages']['update']();
for (let i = 0; i < 10; i++) {
  await lib.stripe.x();
  SUPPL.clearbit.hello();
  lib = LOLOLOL;
  await stripe.charges.create();
  await slack.channels.info();
  lib.stripe.xxx;
}
module.exports = async function () {
  let charges = stripe.charges;
  await lib.airtable.whatever();
  await charges.create();
}
`

};
