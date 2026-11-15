import {useCallback,useEffect,useRef,useState} from 'react';
import {createRequestGate} from './requestGate';
import {getTransfer,transferInputError,transferKey,type TransferInput,type TransferResult} from './transfer';

/** One calculation shared by the timing form and the automatically playing mission scene. */
export function useTransferCalculation(input: TransferInput,enabled=false) {
  const {departureUtc,arrivalUtc,parkingAltitudeKm}=input;
  const key=transferKey(input);
  const gate=useRef(createRequestGate());
  const successfulKey=useRef<string|null>(null);
  const [response,setResponse]=useState<{key:string;data?:TransferResult;loading?:boolean;error?:string}|null>(null);
  const current=response?.key===key?response:null;
  const problem=transferInputError(input);
  useEffect(()=>()=>gate.current.invalidate(),[key,enabled]);
  const calculate=useCallback(async()=>{
    const request={departureUtc,arrivalUtc,parkingAltitudeKm};
    if(transferInputError(request))return;
    const ticket=gate.current.begin();successfulKey.current=null;setResponse({key,loading:true});
    try {
      const data=await getTransfer(request,ticket.signal);
      if(ticket.current()){successfulKey.current=key;setResponse({key,data});}
    }catch(error){if(ticket.current())setResponse({key,error:error instanceof Error?error.message:'Transfer calculation failed.'});}
  },[departureUtc,arrivalUtc,parkingAltitudeKm,key]);
  useEffect(()=>{
    if(!enabled||problem||successfulKey.current===key)return;
    // Debounce date/altitude editing. No repeated automatic retries after a failed request.
    const timer=window.setTimeout(()=>void calculate(),250);
    return()=>window.clearTimeout(timer);
  },[enabled,key,problem,calculate]);
  return {key,data:current?.data,loading:!!current?.loading,error:current?.error,problem,calculate};
}
