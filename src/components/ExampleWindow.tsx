import React, { useState, useEffect } from 'react'
import { useExampleStore } from '../stores/example.store'

interface ExampleWindowProps {
  isOpen: boolean
  onClose: () => void
  selectedType: string
}

const ExampleWindow: React.FC<ExampleWindowProps> = ({ 
  isOpen, 
  onClose, 
  selectedType 
}) => {
  const { examples, getByType } = useExampleStore()
  const [filteredExamples, setFilteredExamples] = useState(examples)


  useEffect(() => {
    if (selectedType) {
      const typeExamples = getByType(selectedType)
      setFilteredExamples(typeExamples)
    }
  }, [selectedType, examples])

  const handleExampleClick = (content: string) => {
    // 这里可以添加点击示例的处理逻辑
    console.log('Example selected:', content)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* 背景遮罩 */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* 弹窗内容 */}
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <span className="sr-only">关闭</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {selectedType === 'subject' ? '主体类' : 
                 selectedType === 'action' ? '动作类' : 
                 selectedType === 'scene' ? '场景类' : 
                 selectedType === 'style' ? '风格类' : 
                 selectedType === 'camera' ? '镜头类' : 
                 selectedType === 'lighting' ? '灯光类' : 
                 selectedType === 'timing' ? '时序类' : 
                 selectedType === 'audio' ? '音频类' : 
                 '约束类'}优秀示例
              </h3>

              <div className="mt-4 max-h-96 overflow-y-auto">
                {filteredExamples.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>暂无该类型的优秀示例</p>
                    <p className="text-sm mt-2">系统正在加载示例数据...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredExamples.map((example) => (
                      <div
                        key={example.id}
                        className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all duration-200 cursor-pointer"
                        onClick={() => handleExampleClick(example.content)}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-md font-medium text-gray-900">
                            {example.title}
                          </h4>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-yellow-600">
                              {example.score}/100
                            </span>
                            {example.reason && (
                              <span className="text-xs text-gray-500">
                                {example.reason}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-gray-600">
                          {example.content}
                        </div>

                        {example.tags && example.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {example.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExampleWindow