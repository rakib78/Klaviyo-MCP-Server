// ─── Klaviyo JSON:API envelope types ─────────────────────────────────────────

export interface KlaviyoAttributes {
  [key: string]: unknown;
}

export interface KlaviyoResource<T extends KlaviyoAttributes = KlaviyoAttributes> {
  type: string;
  id: string;
  attributes: T;
  relationships?: Record<string, unknown>;
  links?: { self?: string };
}

export interface KlaviyoListResponse<T extends KlaviyoAttributes = KlaviyoAttributes> {
  data: KlaviyoResource<T>[];
  links?: {
    self?: string;
    next?: string | null;
    prev?: string | null;
  };
  meta?: {
    total?: number;
    next?: string | null;
    [key: string]: unknown;
  };
}

export interface KlaviyoSingleResponse<T extends KlaviyoAttributes = KlaviyoAttributes> {
  data: KlaviyoResource<T>;
}

// ─── Profile types ────────────────────────────────────────────────────────────

export interface ProfileAttributes extends KlaviyoAttributes {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  title?: string;
  location?: {
    address1?: string;
    city?: string;
    region?: string;
    country?: string;
    zip?: string;
  };
  properties?: Record<string, unknown>;
  subscriptions?: {
    email?: { marketing?: { consent?: string } };
    sms?: { marketing?: { consent?: string } };
  };
  predictive_analytics?: {
    historic_clv?: number;
    predicted_clv?: number;
    total_clv?: number;
    historic_number_of_orders?: number;
    average_days_between_orders?: number;
    churn_probability?: number;
  };
  created?: string;
  updated?: string;
}

// ─── Campaign types ───────────────────────────────────────────────────────────

export interface CampaignAttributes extends KlaviyoAttributes {
  name: string;
  status: string;
  archived: boolean;
  audiences?: {
    included?: string[];
    excluded?: string[];
  };
  send_options?: {
    use_smart_sending?: boolean;
  };
  tracking_options?: {
    is_add_utm?: boolean;
    utm_params?: Array<{ name: string; value: string }>;
  };
  send_strategy?: {
    method?: string;
    options_static?: {
      datetime?: string;
      is_local?: boolean;
      send_past_recipients_immediately?: boolean;
    };
  };
  created_at?: string;
  scheduled_at?: string;
  updated_at?: string;
  send_time?: string;
}

// ─── Flow types ───────────────────────────────────────────────────────────────

export interface FlowAttributes extends KlaviyoAttributes {
  name: string;
  status: string;
  archived: boolean;
  created: string;
  updated: string;
  trigger_type?: string;
}

// ─── List types ───────────────────────────────────────────────────────────────

export interface ListAttributes extends KlaviyoAttributes {
  name: string;
  created: string;
  updated: string;
  opt_in_process?: string;
}

// ─── Segment types ────────────────────────────────────────────────────────────

export interface SegmentAttributes extends KlaviyoAttributes {
  name: string;
  created: string;
  updated: string;
  is_active?: boolean;
  is_processing?: boolean;
  is_starred?: boolean;
}

// ─── Metric types ─────────────────────────────────────────────────────────────

export interface MetricAttributes extends KlaviyoAttributes {
  name: string;
  created: string;
  updated: string;
  integration?: {
    object?: string;
    name?: string;
    category?: string;
  };
}

// ─── Event types ─────────────────────────────────────────────────────────────

export interface EventAttributes extends KlaviyoAttributes {
  timestamp: string;
  event_properties?: Record<string, unknown>;
  datetime?: string;
  uuid?: string;
}

// ─── Template types ───────────────────────────────────────────────────────────

export interface TemplateAttributes extends KlaviyoAttributes {
  name: string;
  editor_type?: string;
  html?: string;
  text?: string;
  created?: string;
  updated?: string;
}

// ─── API error ────────────────────────────────────────────────────────────────

export interface KlaviyoApiError {
  id?: string;
  status: number;
  code?: string;
  title: string;
  detail?: string;
  source?: { pointer?: string };
  meta?: Record<string, unknown>;
}

export interface KlaviyoErrorResponse {
  errors: KlaviyoApiError[];
}
