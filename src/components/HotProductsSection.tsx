import React from 'react'
import { hotProductsMeta, type HotProduct } from '../data/hotProducts'
import { usd } from '../lib/format'

type HotProductsSectionProps = {
  products: HotProduct[]
  selectedId?: string | null
  onQuote: (product: HotProduct) => void
}

export default function HotProductsSection({ products, selectedId, onQuote }: HotProductsSectionProps) {
  if (!products.length) return null

  return <section className="hot-products-section" id="hot-products">
    <div className="mobile-section-title">
      <div>
        <span className="eyebrow">Hot products cacheados</span>
        <h2>Oportunidades para cotizar</h2>
      </div>
      <small>{hotProductsMeta.cacheVersion}</small>
    </div>
    <p className="hot-products-note">Se muestran desde cache local. No consumen créditos de Alibaba/Parsebot al cargar la home.</p>
    <div className="hot-products-rail">
      {products.map((product) => {
        const selected = product.id === selectedId
        return <article className={`hot-product-card${selected ? ' hot-product-selected' : ''}`} key={product.id}>
          <div className="hot-product-art" aria-hidden="true"><span>{product.icon}</span></div>
          <div className="hot-product-body">
            <div className="hot-product-topline"><span>{product.category}</span><em>{product.tag}</em></div>
            <h3>{product.title}</h3>
            <p>{product.supplierName} · {product.supplierYears}</p>
            <div className="hot-product-metrics">
              <div><span>FOB</span><b>{usd(product.unitPriceUsd)}</b></div>
              <div><span>MOQ</span><b>{product.moq} u.</b></div>
              <div><span>Vol/u.</span><b>{product.unitVolumeCbm} m³</b></div>
            </div>
            <button type="button" className="primary hot-product-cta" onClick={() => onQuote(product)}>{selected ? 'Cargado en cotización' : 'Cotizar'}</button>
          </div>
        </article>
      })}
    </div>
  </section>
}
