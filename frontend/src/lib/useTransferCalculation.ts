import {useEffect,useRef,useState} from 'react';
import {createRequestGate} from './requestGate';
import {getTransfer,transferInputError,transferKey,type TransferInput,type TransferResult} from './transfer';

/** Shared calculation state for the timing form and the main mission animation. */
export function useTransferCalculation(input: TransferInput) {
  const key=transferKey(input);
  const gate=useRef(createRequestGate());
  const [response,setResponse]=useState<{key:string;data?:TransferResult;loading?:boolean;error?:string}|null>(null);
  const current=response?.key===key?response:null;
  const problem=transferInputError(input);
  useEffect(()=>()=>gate.current.invalidate(),[key]);
  async function calculate() {
    if(problem)return;
    const ticket=gate.current.begin();setResponse({key,loading:true});
    try {
      const data=await getTransfer(input,ticket.signal);
      if(ticket.current())setResponse({key,data});
    }catch(error){if(ticket.current())setResponse({key,error:error instanceof Error?error.message:'Transfer calculation failed.'});}
  }
  return {key,data:current?.data,loading:!!current?.loading,error:current?.error,problem,calculate};
}
