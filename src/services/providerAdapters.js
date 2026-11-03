/**
 * FinTrack PRO — Provider Integration Adapters
 *
 * Architecture for authorized external provider integrations:
 * 1. Bharat Connect / BBPS (NPCI Biller Gateway)
 * 2. Account Aggregator (RBI-regulated NBFC-AA for open banking)
 * 3. UPI Intent / Deep-linking Gateway
 *
 * In current deployment, direct provider APIs require verified organizational credentials
 * and regulatory registration. This adapter defines the production contracts and returns
 * transparent status information without fabricating data or unauthorized credential storage.
 */

export const BHARAT_CONNECT_STATUS = {
  AVAILABLE: false,
  STATUS: 'requires_provider_access',
  MESSAGE:
    'Bharat Connect (BBPS) integration requires licensed BBPS Agent Institution credentials and NPCI onboarding.',
  SUPPORTED_CATEGORIES: [
    'Electricity',
    'Water',
    'Gas',
    'Mobile recharge',
    'Broadband',
    'DTH',
    'Other',
  ],
};

export const ACCOUNT_AGGREGATOR_STATUS = {
  AVAILABLE: false,
  STATUS: 'requires_provider_access',
  MESSAGE:
    'Automatic bank statement synchronization requires an RBI-regulated Account Aggregator (AA) ecosystem license (Sahamati/Finvu/Setu).',
  SUPPORTED_BANKS: [
    'HDFC Bank',
    'State Bank of India',
    'ICICI Bank',
    'Axis Bank',
    'Kotak Mahindra Bank',
    'Punjab National Bank',
    'Bank of Baroda',
    'IndusInd Bank',
    'Yes Bank',
  ],
};

export const UPI_PROVIDER_STATUS = {
  AVAILABLE: true,
  MODE: 'csv_and_statement_import',
  PROVIDERS: ['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay', 'Cred', 'Other'],
  MESSAGE:
    'Direct UPI API access is reserved for authorized payment applications. FinTrack supports instant CSV and UPI statement import with automatic duplicate detection.',
};

/**
 * BBPS Adapter Stub
 */
export class BharatConnectAdapter {
  static getStatus() {
    return BHARAT_CONNECT_STATUS;
  }

  static async fetchBillers(category) {
    return {
      status: BHARAT_CONNECT_STATUS.STATUS,
      message: BHARAT_CONNECT_STATUS.MESSAGE,
      category,
      billers: [],
    };
  }

  static async fetchLiveBill({ billerId, consumerNumber }) {
    return {
      status: BHARAT_CONNECT_STATUS.STATUS,
      message: BHARAT_CONNECT_STATUS.MESSAGE,
      billDetails: null,
    };
  }
}

/**
 * Account Aggregator Adapter Stub
 */
export class AccountAggregatorAdapter {
  static getStatus() {
    return ACCOUNT_AGGREGATOR_STATUS;
  }

  static async initiateConsent({ vpa, bankId }) {
    return {
      status: ACCOUNT_AGGREGATOR_STATUS.STATUS,
      message: ACCOUNT_AGGREGATOR_STATUS.MESSAGE,
      consentHandle: null,
    };
  }
}

export default {
  BHARAT_CONNECT_STATUS,
  ACCOUNT_AGGREGATOR_STATUS,
  UPI_PROVIDER_STATUS,
  BharatConnectAdapter,
  AccountAggregatorAdapter,
};

