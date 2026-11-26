// Keep complete row objects when a large response ends before its closing brace.
export function readVibeResponse(body){
  const content=body.trim().replace(/^\x60{3}(?:json)?\s*/iu,'').replace(/\s*\x60{3}$/u,'')
  try{
    return {results:JSON.parse(content).results}
  }catch(error){
    const header=/^\{\s*"results"\s*:\s*\[/u.exec(content)
    if(!header)throw error
    const results=[]
    let at=header[0].length
    while(at<content.length){
      while(/\s/u.test(content[at]??''))at++
      if(content[at]!=='{')break
      const start=at
      let depth=0,quote=false
      for(;at<content.length;at++){
        const c=content[at]
        if(quote){
          if(c==='\\')at++
          else if(c==='"')quote=false
        }else if(c==='"')quote=true
        else if(c==='{')depth++
        else if(c==='}'&&--depth===0)break
      }
      if(at>=content.length)break
      try{results.push(JSON.parse(content.slice(start,++at)))}catch{break}
      while(/\s/u.test(content[at]??''))at++
      if(content[at]!==',')break
      at++
    }
    if(!results.length)throw error
    return {results,partial:true}
  }
}
