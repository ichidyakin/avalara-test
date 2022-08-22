import { parse, stringify } from 'csv/sync'
import * as fs from 'fs'
const Avatax = require('avatax');

function parseCsv(filename: string): any[] {
  const csvData = fs.readFileSync(filename);
  const records = parse(csvData,
  {
    columns: true,
    skip_empty_lines: true
  });
  console.log(`Parsed ${records.length} records`);
  return records;
}

function getEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Did not find ${name}`);
  return value;
}

function createAvataxClient(): any {
  const username = getEnvironmentVariable('AVALARA_LOGIN');
  const password = getEnvironmentVariable('AVALARA_PASSWORD');

  const config = {
    appName: 'Symon Tests',
    appVersion: '1.0',
    environment: 'sandbox',
    machineName: 'ichidyakin2'
  };
  
  const creds = {
    username,
    password
  };
  
  const client = new Avatax(config).withSecurity(creds);
  return client;
}

async function resolveTaxes(avaClient: any, address: any, amount: number, i: number): Promise<number> {
  const taxDocument = {
    type: 'SalesOrder',
    companyCode: 'DEFAULT',
    date: '2022-08-15',
    customerCode: 'ABC',
    purchaseOrderNo: '001',
    addresses: {
      SingleLocation: address
    },
    lines: [
      {
        number: '1',
        quantity: 1,
        amount,
        itemCode: 'A0Y3GLL',
        description: 'Symon Subscription Test'
      }
    ],
    commit: false,
    currencyCode: 'USD',
    description: 'Symon Tests'
  }

  let result = { totalTaxCalculated: NaN };
  try {
    result = await avaClient.createTransaction({ model: taxDocument });
  } catch (e) {
    console.log(`Tax resolution for the record ${i} failed: ${e}`)
  }
  return result.totalTaxCalculated;
}

function buildResultRecord(record: any, newAddress: any, tax: number): any {
  const result = { ...record };
  result['new_line1'] = newAddress.line1;
  result['new_city'] = newAddress.city;
  result['new_region'] = newAddress.region;
  result['new_country'] = newAddress.country;
  result['new_postalCode'] = newAddress.postalCode;
  result['new_line1'] = newAddress.line1;
  result['messages'] = newAddress.messages;
  result['tax'] = tax;
  return result;
}

function buildMessages(source: any[]): string {
  let result = '';
  if (source) {
    for (let i=0;i<source.length;i++) {
      result += `${source[i].summary} ${source[i].details} EOM. ` 
    }
  }
  return result;
}

async function resolveAddress(avaClient: any, record: any, i: number): Promise<any> {
  let result;
  try {
    const addressResolutionResult = await avaClient.resolveAddress(record);
    if (addressResolutionResult.validatedAddresses.length === 0) {
      console.error(`Could not resolve address for a record ${i}`);
    }
  
    if (addressResolutionResult.validatedAddresses.length > 1) {
      console.warn(`Multiple addresses resolved for a record ${i}. Using the first one!`);
    } 
    result = addressResolutionResult.validatedAddresses[0] ?? {};
    result['messages'] = buildMessages(addressResolutionResult.messages);
  } catch (e) {
    console.error(`AvaClient failure for the record ${i}: ${e}`);
    result = {
      messages: [
        `${e}`
      ]
    }
  }
  return result;
}

async function main(argv: string[]): Promise<void> {
  if (!argv[2] || !argv[3]) {
    console.error('Should specify input and output files in the command line');
  }
  const records = parseCsv(argv[2]);
  const avaClient = createAvataxClient();
  const results = [];
  for (let i=0; i<records.length; i++) {
    const record = records[i];
    console.log(`Record ${i}: BEGIN`);
    const resolvedAddress = await resolveAddress(avaClient, record, i);
    console.log(`Record ${i}: Address resolution done.`);
    const resolvedTaxAmount = await resolveTaxes(avaClient, resolvedAddress, record.amount, i);
    console.log(`Record ${i}: Tax resolution done.`);
    const result = buildResultRecord(record, resolvedAddress, resolvedTaxAmount);
    
    results.push(result);
  }
  const output = stringify(results, {
    header: true
  });
  fs.writeFile(argv[3], output, {
    encoding: 'utf-8'
  }, () => {});
}


main(process.argv).then(() => {
  console.log('Done!');
});