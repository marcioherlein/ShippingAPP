import { describe, expect, it } from 'vitest'
import { extractAlibabaDirectHttp } from './alibabaDirectProvider'

describe('Alibaba visible specification row repair', () => {
  it('does not let adjacent labels contaminate origin, material or product type', async () => {
    const url = new URL('https://www.alibaba.com/product-detail/Automatic-Poultry-Incubator_1601666174895.html')
    const html = `<!doctype html><html><head><meta property="og:title" content="Automatic Poultry Incubator"></head><body>
      <nav class="product-breadcrumb"><a>Home</a><a>Agriculture</a><a>Egg Incubators</a></nav>
      <div>FOB Price: US $84 / piece</div>
      <div>Minimum Order Quantity: 2 pieces</div>
      <div>Package Weight: 8.5 kg</div>
      <div>Package Dimensions: 55 x 55 x 35 cm</div>
      <div>Place of Origin: Henan, China</div>
      <div>Material: ABS</div>
      <div>Product Type: Poultry Incubator</div>
      <script type="application/json">{"productId":"1601666174895","productTitle":"Automatic Poultry Incubator","hsCode":"843621"}</script>
      ${'wholesale supplier product detail '.repeat(30)}
    </body></html>`

    const result = await extractAlibabaDirectHttp(
      url,
      async () => new Response(html, { status: 200 }),
      async () => ({ status: 'unavailable', source: 'Alibaba public listing', facts: null, warnings: [] } as any),
      async () => ({ status: 'unavailable', source: 'Alibaba high-signal public corroboration', facts: null, warnings: [] } as any),
    )

    expect(result.status).toBe('ready')
    if (result.status === 'unavailable') throw new Error('expected direct facts')
    expect(result.facts.originCountry).toBe('Henan, China')
    expect(result.facts.material).toBe('ABS')
    expect(result.facts.functionText).toBe('Poultry Incubator')
    expect(result.facts.specifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Place of Origin', value: 'Henan, China' }),
      expect.objectContaining({ name: 'Material', value: 'ABS' }),
      expect.objectContaining({ name: 'Product Type', value: 'Poultry Incubator' }),
    ]))
  })
})
