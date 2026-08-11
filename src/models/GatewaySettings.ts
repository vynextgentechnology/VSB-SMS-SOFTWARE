import mongoose, { Schema, Document } from 'mongoose';

export interface IGatewaySettings extends Document {
  provider: string;
  fast2smsApiKey?: string;
  fast2smsSenderId?: string;
  fast2smsRoute?: string;
  fast2smsEnabled?: boolean;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  whatsAppEnabled?: boolean;
  whatsAppApiKey?: string;
  autoSendResultSms?: boolean;
  defaultSenderName?: string;
}

const GatewaySettingsSchema: Schema = new Schema({
  provider: { type: String, default: 'Fast2SMS' },
  fast2smsApiKey: { type: String, default: '' },
  fast2smsSenderId: { type: String, default: 'VSBEC' },
  fast2smsRoute: { type: String, default: 'dlt' },
  fast2smsEnabled: { type: Boolean, default: true },
  twilioAccountSid: { type: String, default: '' },
  twilioAuthToken: { type: String, default: '' },
  twilioFromNumber: { type: String, default: '+18005550199' },
  whatsAppEnabled: { type: Boolean, default: false },
  whatsAppApiKey: { type: String, default: '' },
  autoSendResultSms: { type: Boolean, default: false },
  defaultSenderName: { type: String, default: 'VSBEC VY NEXTGEN' },
});

export const GatewaySettingsModel =
  mongoose.models.GatewaySettings ||
  mongoose.model<IGatewaySettings>('GatewaySettings', GatewaySettingsSchema);
