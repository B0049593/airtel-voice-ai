const customers = [];

// Helper to generate a random 10-digit mobile number
function generateMobile() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
}

const indianNames = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Riya", "Diya", "Aanya", 
  "Priya Sharma", "Rahul Verma", "Sneha Iyer", "Amit Patel", "Neha Gupta", "Vikram Singh"
];

// Generate 50 Prepaid
for (let i = 0; i < 50; i++) {
  const isExhausted = Math.random() > 0.8;
  const isBarred = Math.random() > 0.95;
  const plan = Math.random() > 0.5 ? { name: "2GB Daily Plan", price: 349, validity: "28 days", ott: ["Airtel Xstream Play"] } : { name: "3GB Daily Plan", price: 499, validity: "28 days", ott: ["Airtel Xstream Play", "Amazon Prime"] };
  
  customers.push({
    mobile_number: generateMobile(),
    name: indianNames[Math.floor(Math.random() * indianNames.length)],
    account_type: "prepaid",
    active_plan_name: plan.name,
    active_plan_price: plan.price,
    data_balance: isExhausted ? "0MB remaining of daily quota" : (Math.floor(Math.random() * 2000) + "MB remaining of daily quota"),
    validity: plan.validity,
    account_status: isBarred ? "barred" : "active",
    email: `customer${i}@example.com`,
    ott_benefits: plan.ott,
    complaints: Math.random() > 0.8 ? ["Slow internet speed in area"] : [],
    outage: false
  });
}

// Generate 50 Postpaid
for (let i = 0; i < 50; i++) {
  const isBarred = Math.random() > 0.95;
  const plan = Math.random() > 0.5 ? { name: "Infinity 599", rental: 599, data: "75GB rollover", ott: ["Netflix Basic", "Amazon Prime"] } : { name: "Family 999", rental: 999, data: "130GB rollover", ott: ["Netflix Standard", "Amazon Prime"] };
  const baseBill = plan.rental;
  const extraUsage = Math.random() > 0.7 ? Math.floor(Math.random() * 200) : 0;
  const tax = Math.floor((baseBill + extraUsage) * 0.18);
  const totalBill = baseBill + extraUsage + tax;

  customers.push({
    mobile_number: generateMobile(),
    name: indianNames[Math.floor(Math.random() * indianNames.length)],
    account_type: "postpaid",
    active_plan_name: plan.name,
    active_plan_price: plan.rental,
    data_balance: Math.floor(Math.random() * 70) + "GB remaining",
    billing_cycle: "1st to 30th",
    bill_amount: totalBill,
    bill_due_date: "15th of current month",
    bill_breakup: { base: baseBill, extra: extraUsage, tax: tax },
    account_status: isBarred ? "barred (unpaid bill)" : "active",
    email: `postpaid${i}@example.com`,
    ott_benefits: plan.ott,
    complaints: [],
    outage: false
  });
}

// Add one specific hardcoded customer so we have a known number for testing
customers.push({
  mobile_number: "9876543210",
  name: "Priya Sharma",
  account_type: "postpaid",
  active_plan_name: "Infinity 549",
  active_plan_price: 549,
  data_balance: "22GB remaining",
  billing_cycle: "1st to 30th",
  bill_amount: 647,
  bill_due_date: "May 20th",
  bill_breakup: { base: 549, extra: 0, tax: 98 },
  account_status: "active",
  email: "priya.sharma@example.com",
  ott_benefits: ["Amazon Prime", "Airtel Xstream Play"],
  complaints: [],
  outage: false
});

const rechargeCatalogue = {
  prepaid: [
    { name: "Mega Data Pack", price: 499, validity: "28 days", description: "3GB daily data, unlimited calls" },
    { name: "Unlimited Combo Pack", price: 699, validity: "30 days", description: "unlimited data (FUP 2.5GB daily), unlimited calls" },
    { name: "Data Booster 1GB", price: 19, validity: "same as base plan", description: "1GB extra data" },
    { name: "Data Booster 3GB", price: 49, validity: "same as base plan", description: "3GB extra data" }
  ],
  postpaid: [
    { name: "Infinity 549", price: 549, description: "40GB data, unlimited calls, Amazon Prime" },
    { name: "Infinity 598", price: 598, description: "2GB daily data, unlimited calls, Netflix Basic" }
  ]
};

function getCustomerByPhone(phone) {
  // If the agent doesn't pass a phone or passes a dummy one, default to our test user
  if (!phone || phone === "unknown") phone = "9876543210";
  return customers.find(c => c.mobile_number === phone) || null;
}

function getRechargeOffers(accountType) {
  return rechargeCatalogue[accountType.toLowerCase()] || [];
}

module.exports = {
  getCustomerByPhone,
  getRechargeOffers
};
