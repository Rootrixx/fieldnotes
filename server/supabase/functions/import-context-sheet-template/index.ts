import { createClient } from 'npm:@supabase/supabase-js@2';

type ImportTemplateRequest = {
  base64?: string;
  fileName?: string;
  mimeType?: string;
};

type TemplateRow = {
  id: string;
  name: string;
  schema_json: Record<string, unknown>;
  prompt_text: string;
};

type TemplateImportModelResponse = {
  name?: string;
  fieldGuidance?: string;
  renderHtml?: string;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? '';
const supabaseServiceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
const openAiApiKey = Deno.env.get('OPENAI_API_KEY')?.trim() ?? '';
const templateOcrModel =
  Deno.env.get('OPENAI_TEMPLATE_OCR_MODEL')?.trim() || 'gpt-4.1-mini';

const allowedTemplatePlaceholders = [
  'site.code',
  'site.name',
  'additionalSheets',
  'contextNumber',
  'contextType',
  'trench',
  'planNumber',
  'sectionNumber',
  'coordinates',
  'level',
  'relationships.overlainBy',
  'relationships.abuttedBy',
  'relationships.cutBy',
  'relationships.filledBy',
  'relationships.sameAs',
  'relationships.partOf',
  'relationships.consistsOf',
  'relationships.overlies',
  'relationships.butts',
  'relationships.cuts',
  'relationships.fillOf',
  'relationships.uncertain',
  'description',
  'interpretationDiscussion',
  'temporalSequence.above',
  'temporalSequence.current',
  'temporalSequence.below',
  'smallFinds',
  'samples',
  'buildingMaterials',
  'recorder',
  'date',
  'initials',
];

function createJsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return fallback;
}

function normalizeBase64(value: string | undefined) {
  return value?.replace(/^data:[^;]+;base64,/, '').trim() ?? '';
}

function normalizeMimeType(value: string | undefined) {
  const mimeType = value?.trim().toLowerCase() ?? '';

  if (!mimeType.startsWith('image/')) {
    throw new Error('Upload a photo or image of the context sheet. PDF OCR is not enabled yet.');
  }

  return mimeType;
}

function sanitizeTemplateName(value: string | undefined, fileName: string) {
  const normalizedValue = value?.trim();

  if (normalizedValue) {
    return normalizedValue.slice(0, 80);
  }

  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 80) || 'Imported context sheet';
}

function normalizeRenderHtml(value: string | undefined) {
  const html = value?.trim();

  if (html?.includes('{{') && html.includes('}}')) {
    return html;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; color: #1f1614; padding: 24px; }
      h1 { font-size: 22px; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #333; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #eee; width: 30%; }
    </style>
  </head>
  <body>
    <h1>Context {{contextNumber}}</h1>
    <table>
      <tr><th>Site</th><td>{{site.code}} {{site.name}}</td></tr>
      <tr><th>Trench</th><td>{{trench}}</td></tr>
      <tr><th>Type</th><td>{{contextType}}</td></tr>
      <tr><th>Level</th><td>{{level}}</td></tr>
      <tr><th>Description</th><td>{{description}}</td></tr>
      <tr><th>Interpretation</th><td>{{interpretationDiscussion}}</td></tr>
      <tr><th>Relationships</th><td>{{relationships.uncertain}}</td></tr>
      <tr><th>Finds</th><td>{{smallFinds}}</td></tr>
      <tr><th>Samples</th><td>{{samples}}</td></tr>
      <tr><th>Recorder</th><td>{{recorder}} {{date}} {{initials}}</td></tr>
    </table>
  </body>
</html>`;
}

async function loadDefaultTemplate(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('context_sheet_templates')
    .select('id, name, schema_json, prompt_text')
    .is('user_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const template = (data as TemplateRow | null) ?? null;

  if (!template) {
    throw new Error('No default context sheet template is configured.');
  }

  return template;
}

async function generateTemplateFromImage({
  base64,
  defaultPrompt,
  fileName,
  mimeType,
}: {
  base64: string;
  defaultPrompt: string;
  fileName: string;
  mimeType: string;
}) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: templateOcrModel,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You create reusable archaeological context-sheet templates from uploaded form images. ' +
            'Return JSON only. Use the image OCR to infer the company form name, field labels, ' +
            'field order, and layout. The generated renderHtml must be a complete compact HTML ' +
            'document that resembles the uploaded form and uses only the allowed {{placeholder}} values. ' +
            `Allowed placeholders: ${allowedTemplatePlaceholders.join(', ')}.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `File name: ${fileName}\n\n` +
                'Create a template for future field-note extraction. Return JSON with:\n' +
                '- name: short company/form name\n' +
                '- fieldGuidance: instructions for mapping spoken notes into this exact form\n' +
                '- renderHtml: complete HTML using {{placeholder}} values\n\n' +
                'Base extraction rules to preserve and extend:\n' +
                defaultPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_object',
      },
    }),
  });

  const payload = (await response.json()) as OpenAiChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenAI template OCR failed.');
  }

  const message = payload.choices?.[0]?.message;
  const responseText = message?.content?.trim();

  if (message?.refusal?.trim()) {
    throw new Error(`OpenAI refused the template import: ${message.refusal.trim()}`);
  }

  if (!responseText) {
    throw new Error('OpenAI returned an empty template import payload.');
  }

  return JSON.parse(responseText) as TemplateImportModelResponse;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return createJsonResponse(405, {
      error: 'Method not allowed.',
    });
  }

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !openAiApiKey) {
    return createJsonResponse(500, {
      error:
        'Missing required function configuration. Check Supabase and OpenAI environment variables.',
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  let stage = 'request';

  try {
    stage = 'auth';
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return createJsonResponse(401, {
        error: 'You must be signed in before importing a context sheet template.',
      });
    }

    stage = 'payload';
    const body = (await request.json()) as ImportTemplateRequest;
    const base64 = normalizeBase64(body.base64);
    const mimeType = normalizeMimeType(body.mimeType);
    const fileName = body.fileName?.trim() || 'context-sheet-image';

    if (!base64) {
      return createJsonResponse(400, {
        error: 'Upload a context sheet image before importing a template.',
      });
    }

    if (base64.length > 12_000_000) {
      return createJsonResponse(413, {
        error: 'The image is too large. Try a smaller photo or screenshot.',
      });
    }

    stage = 'default_template';
    const defaultTemplate = await loadDefaultTemplate(adminClient);

    stage = 'ocr';
    const importedTemplate = await generateTemplateFromImage({
      base64,
      defaultPrompt: defaultTemplate.prompt_text,
      fileName,
      mimeType,
    });

    stage = 'insert_template';
    const name = sanitizeTemplateName(importedTemplate.name, fileName);
    const fieldGuidance = importedTemplate.fieldGuidance?.trim();
    const promptText = [
      defaultTemplate.prompt_text,
      '',
      'Imported company-specific context sheet guidance:',
      fieldGuidance ||
        'Follow the uploaded company context sheet layout and map spoken field observations into the closest matching fields.',
    ].join('\n');
    const renderHtml = normalizeRenderHtml(importedTemplate.renderHtml);
    const { data: template, error: insertError } = await adminClient
      .from('context_sheet_templates')
      .insert({
        user_id: user.id,
        name,
        schema_json: defaultTemplate.schema_json,
        prompt_text: promptText,
        render_html: renderHtml,
      })
      .select('id, name, created_at')
      .single();

    if (insertError || !template) {
      throw insertError ?? new Error('Could not create the imported template.');
    }

    return createJsonResponse(200, {
      template: {
        id: template.id,
        name: template.name,
        createdAt: template.created_at,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        error: getErrorMessage(error, 'Unknown error'),
        stage,
      })
    );

    return createJsonResponse(500, {
      error: getErrorMessage(error, 'Could not import the context sheet template.'),
      stage,
    });
  }
});
