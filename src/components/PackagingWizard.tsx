import { useEffect, useState } from 'react'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'

/** Dimensions and known volume are alternative sources; output is always m³ per unit. */
export default function PackagingWizard({onComplete,onCancel,recoveryKey='current'}:{onComplete:(volume:number)=>void;onCancel:()=>void;recoveryKey?:string}) {
  const [saved] = useState(() => readProductDraft<{step:number;carton:boolean;values:string[]}>(`packaging:${recoveryKey}`))
  const [step,setStep]=useState(saved?.step || 0)
  const [carton,setCarton]=useState(saved?.carton || false)
  const [values,setValues]=useState(saved?.values || ['','','','1'])
  useEffect(() => { writeProductDraft(`packaging:${recoveryKey}`,{step,carton,values}) },[step,carton,values,recoveryKey])
  const labels=['Largo del embalaje (cm)','Ancho del embalaje (cm)','Alto del embalaje (cm)','Unidades dentro de esa caja']
  const index=step-1
  const count=carton?4:3
  const valid=Number(values[index])>0 && Number.isFinite(Number(values[index])) && (index!==3 || Number.isInteger(Number(values[index])))
  const volume=Number(values[0])*Number(values[1])*Number(values[2])/1_000_000/(carton?Number(values[3]):1)
  return <div className="packaging-wizard">
    {step===0?<><h2>¿Qué embalaje vas a medir?</h2><p>Usá la caja exterior que viaja, incluyendo la protección.</p><div className="case-choices"><button type="button" onClick={()=>{setCarton(false);setStep(1)}}>Una unidad embalada</button><button type="button" onClick={()=>{setCarton(true);setStep(1)}}>Una caja con varias unidades</button></div></>:step<=count?<><h2>{labels[index]}</h2><label><span className="sr-only">{labels[index]}</span><input autoFocus key={index} type="number" min="0" step={index===3?'1':'any'} value={values[index]} onChange={e=>setValues(current=>current.map((v,i)=>i===index?e.target.value:v))}/></label><p>{index===3?'Dividimos el volumen de la caja por esta cantidad.':'Medí de borde a borde en centímetros. No uses las medidas del producto sin embalaje.'}</p><button type="button" className="journey-primary-action" disabled={!valid} onClick={()=>setStep(step+1)}>Continuar con el embalaje</button></>:<><h2>Volumen calculado</h2><p>{values[0]} × {values[1]} × {values[2]} cm {carton?`÷ ${values[3]} unidades`:''}</p><strong>{volume.toLocaleString('es-AR',{maximumFractionDigits:8})} m³ por unidad</strong><p>No necesitás ingresar también el volumen. Usaremos este resultado para el flete.</p><button type="button" className="journey-primary-action" disabled={!Number.isFinite(volume) || volume <= 0} onClick={()=>onComplete(volume)}>Usar este volumen</button></>}
    {step>0&&<button type="button" className="pipeline-secondary" onClick={()=>setStep(step-1)}>Volver al dato anterior</button>}
    <button type="button" className="pipeline-secondary" onClick={onCancel}>Ingresar un volumen conocido</button>
  </div>
}
